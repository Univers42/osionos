/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useCollabStore.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 16:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Shared-space co-presence slice (AOC §6). It owns the live channels and the
 * projected rosters, and is the ONLY place the app reads/writes presence.
 *
 * TWO CHANNELS, TWO JOBS:
 * - the workspace channel carries identity presence (`memberId, displayName,
 *   color, avatarRef?, lastSeen`) and the reduced `pages` nudge;
 * - the page channel (`collabpage:<pageId>`) carries every page-scoped event
 *   and the page-relative presence (route/caret/selection/focus), so a member's
 *   page state is only ever learned from the page they are actually on (C501).
 * `broadcast` routes by event type; page events are dropped rather than leaked
 * to the workspace when no page channel is open.
 *
 * Hexagonal: this store depends ONLY on the port types + the pure presence model
 * — it imports no transport. `connect`/`connectPage` receive the join functions
 * (the React hooks pass the grobase factory; tests pass fake channels), so the
 * slice is fully testable without a WebSocket. Epoch guards make overlapping
 * connect/disconnect calls safe: a superseded join tears itself down.
 */

import { create } from 'zustand';

import type {
  CollabEvent, PresenceState, RealtimeChannel, SummonReq, SummonRes, Unsubscribe,
} from '../model/realtimeTransport.port';
import { assignMemberColor, rosterFromSnapshot } from '../model/collabPresence';
import { applyCollabEvent, pruneStale, type CursorMap } from '../model/remoteCursors';
import { appendAnnounce, type DurableAnnounce } from '../model/sharedAnnounces';

export type CollabStatus = 'idle' | 'connecting' | 'live' | 'error';
export type CollabPageStatus = 'idle' | 'connecting' | 'live' | 'unavailable' | 'error';

export interface CollabSelf {
  id: string;
  displayName: string;
  avatarRef?: string;
}

/** Joins a Shared space and resolves the live channel (grobase factory in prod). */
export type CollabJoinFn = (spaceId: string, selfId: string) => Promise<RealtimeChannel>;
/** Joins ONE page's channel (`collabpage:<pageId>`). */
export type CollabPageJoinFn = (spaceId: string, pageId: string, selfId: string) => Promise<RealtimeChannel>;

interface CollabState {
  spaceId: string | null;
  self: CollabSelf | null;
  status: CollabStatus;
  members: PresenceState[];            // workspace roster, self excluded (AOC §6)
  cursors: CursorMap;                  // remote carets/selections, self excluded (AOC §3)
  feed: DurableAnnounce[];             // durable note/file announces, self excluded (AOC §4)
  channel: RealtimeChannel | null;
  error: string | null;

  pageId: string | null;               // the page the page channel is bound to
  pageStatus: CollabPageStatus;
  pageMembers: PresenceState[];        // members on THIS page (page channel presence)
  pageChannel: RealtimeChannel | null;
  pageError: string | null;

  connect: (spaceId: string, self: CollabSelf, joinFn: CollabJoinFn) => Promise<void>;
  connectPage: (spaceId: string, pageId: string, self: CollabSelf, joinFn: CollabPageJoinFn) => Promise<void>;
  disconnect: () => void;
  disconnectPage: () => void;
  publishPresence: (patch: Partial<PresenceState>) => void;
  broadcast: (event: CollabEvent) => void;
  nextSeq: () => number;               // one monotone counter for ALL outbound ephemeral events
  onEvent: (handler: (event: CollabEvent) => void) => Unsubscribe;
  onRequest: (handler: (from: string, req: SummonReq) => Promise<SummonRes>) => Unsubscribe;
  request: (target: string, req: SummonReq) => Promise<SummonRes>;
}

const NOOP_UNSUB: Unsubscribe = () => {};

/** The bridge refused the page token (404/403): no page channel, never a retry loop. */
function isPageUnavailable(error: unknown): boolean {
  return error instanceof Error && error.name === 'PageChannelUnavailableError';
}

export const useCollabStore = create<CollabState>((set, get) => {
  let epoch = 0;      // bumped on every workspace connect/disconnect
  let pageEpoch = 0;  // bumped on every page connect/disconnect
  let seq = 0;        // monotone for the store's lifetime — NEVER reset, so a reconnect can't
                      // emit a frame a remote reducer would reject as stale (seq <= last)

  return {
    spaceId: null,
    self: null,
    status: 'idle',
    members: [],
    cursors: new Map(),
    feed: [],
    channel: null,
    error: null,

    pageId: null,
    pageStatus: 'idle',
    pageMembers: [],
    pageChannel: null,
    pageError: null,

    connect: async (spaceId, self, joinFn) => {
      const current = get();
      if (current.spaceId === spaceId && current.status !== 'error' && current.status !== 'idle') return;
      current.channel?.leave();
      const myEpoch = (epoch += 1);
      set({ spaceId, self, status: 'connecting', members: [], cursors: new Map(), feed: [], channel: null, error: null });
      try {
        const channel = await joinFn(spaceId, self.id);
        if (myEpoch !== epoch) { channel.leave(); return; } // superseded
        channel.onPresence((states) => {
          if (myEpoch !== epoch) return;
          const roster = rosterFromSnapshot(states, self.id);
          const present = new Set(roster.map((member) => member.memberId));
          set({ members: roster, cursors: pruneStale(get().cursors, present) });
        });
        // No page-scoped event is accepted from the workspace channel: its only
        // job is identity presence + the `pages` nudge (handled by subscribers).
        channel.setPresence({
          memberId: self.id,
          displayName: self.displayName,
          color: assignMemberColor(self.id),
          avatarRef: self.avatarRef,
          lastSeen: Date.now(),
        });
        set({ channel, status: 'live' });
      } catch (error) {
        if (myEpoch === epoch) {
          set({ status: 'error', error: error instanceof Error ? error.message : 'connect failed' });
        }
      }
    },

    connectPage: async (spaceId, pageId, self, joinFn) => {
      const current = get();
      if (current.pageId === pageId && current.pageStatus === 'live') return;
      current.pageChannel?.leave();
      const myPageEpoch = (pageEpoch += 1);
      set({
        pageId, pageStatus: 'connecting', pageMembers: [], pageChannel: null, pageError: null,
      });
      try {
        const channel = await joinFn(spaceId, pageId, self.id);
        if (myPageEpoch !== pageEpoch) { channel.leave(); return; } // navigated away
        channel.onPresence((states) => {
          if (myPageEpoch !== pageEpoch) return;
          const roster = rosterFromSnapshot(states, self.id);
          const present = new Set(roster.map((member) => member.memberId));
          set({ pageMembers: roster, cursors: pruneStale(get().cursors, present) });
        });
        channel.onEvent((event) => {
          if (myPageEpoch !== pageEpoch) return;
          const next = applyCollabEvent(get().cursors, event, self.id); // same ref when unchanged
          if (next !== get().cursors) set({ cursors: next });
          // Feed filter: the CONTENT-plane events ('blocks', 'pages') are data
          // transfer, not notifications — skip them explicitly so they can
          // never surface as activity announces (appendAnnounce then only has
          // to admit the durable 'note'/'file' kinds).
          const feed = event.t === 'blocks' || event.t === 'pages'
            ? get().feed
            : appendAnnounce(get().feed, event, self.id);
          if (feed !== get().feed) set({ feed });
        });
        channel.setPresence({
          memberId: self.id,
          displayName: self.displayName,
          color: assignMemberColor(self.id),
          avatarRef: self.avatarRef,
          route: pageId,
          lastSeen: Date.now(),
        });
        set({ pageChannel: channel, pageStatus: 'live', pageError: null });
      } catch (error) {
        if (myPageEpoch !== pageEpoch) return;
        // A 404/403 token is final: no page channel and no retry loop (C509).
        set({
          pageStatus: isPageUnavailable(error) ? 'unavailable' : 'error',
          pageError: error instanceof Error ? error.message : 'page connect failed',
        });
      }
    },

    disconnect: () => {
      epoch += 1;
      pageEpoch += 1;
      get().channel?.leave();
      get().pageChannel?.leave();
      set({
        spaceId: null, self: null, status: 'idle', members: [], cursors: new Map(), feed: [],
        channel: null, error: null,
        pageId: null, pageStatus: 'idle', pageMembers: [], pageChannel: null, pageError: null,
      });
    },

    disconnectPage: () => {
      pageEpoch += 1;
      get().pageChannel?.leave();
      set({
        pageId: null, pageStatus: 'idle', pageMembers: [], pageChannel: null, pageError: null,
        cursors: new Map(),
      });
    },

    publishPresence: (patch) => {
      // The workspace adapter strips page fields; the page adapter keeps them.
      get().channel?.setPresence(patch);
      get().pageChannel?.setPresence(patch);
    },

    // Route by scope: the workspace topic only ever carries `pages`; every
    // page-scoped event goes to the page channel and is DROPPED when that
    // channel is absent — never leaked onto `collab:<workspace>` (C501).
    broadcast: (event) => {
      if (event.t === 'pages') get().channel?.broadcast(event);
      else get().pageChannel?.broadcast(event);
    },

    nextSeq: () => (seq += 1),

    onEvent: (handler) => {
      const unsubs: Unsubscribe[] = [];
      const workspace = get().channel;
      const page = get().pageChannel;
      if (workspace) unsubs.push(workspace.onEvent(handler));
      if (page) unsubs.push(page.onEvent(handler));
      return () => { for (const unsubscribe of unsubs) unsubscribe(); };
    },

    onRequest: (handler) => get().channel?.onRequest(handler) ?? NOOP_UNSUB,
    request: (target, req) => get().channel?.request(target, req) ?? Promise.resolve({ accepted: false }),
  };
});

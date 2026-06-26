/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useCollabStore.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 16:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 16:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Shared-space co-presence slice (AOC §6). It owns the live RealtimeChannel
 * and the projected roster, and is the ONLY place the app reads/writes presence.
 *
 * Hexagonal: this store depends ONLY on the port types + the pure presence model
 * — it imports no transport. `connect` receives the join function (the React
 * hook passes the grobase factory; tests pass a fake channel), so the slice is
 * fully testable without a WebSocket. An epoch guard makes overlapping
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

export interface CollabSelf {
  id: string;
  displayName: string;
  avatarRef?: string;
}

/** Joins a Shared space and resolves the live channel (grobase factory in prod). */
export type CollabJoinFn = (spaceId: string, selfId: string) => Promise<RealtimeChannel>;

interface CollabState {
  spaceId: string | null;
  self: CollabSelf | null;
  status: CollabStatus;
  members: PresenceState[];            // roster, self excluded (AOC §6)
  cursors: CursorMap;                  // remote carets/selections, self excluded (AOC §3)
  feed: DurableAnnounce[];             // durable note/file announces, self excluded (AOC §4)
  channel: RealtimeChannel | null;
  error: string | null;

  connect: (spaceId: string, self: CollabSelf, joinFn: CollabJoinFn) => Promise<void>;
  disconnect: () => void;
  publishPresence: (patch: Partial<PresenceState>) => void;
  broadcast: (event: CollabEvent) => void;
  nextSeq: () => number;               // one monotone counter for ALL outbound ephemeral events
  onEvent: (handler: (event: CollabEvent) => void) => Unsubscribe;
  onRequest: (handler: (from: string, req: SummonReq) => Promise<SummonRes>) => Unsubscribe;
  request: (target: string, req: SummonReq) => Promise<SummonRes>;
}

const NOOP_UNSUB: Unsubscribe = () => {};

export const useCollabStore = create<CollabState>((set, get) => {
  let epoch = 0; // bumped on every connect/disconnect; a stale async join self-tears-down
  let seq = 0;   // monotone for the store's lifetime — NEVER reset, so a reconnect can't
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
        channel.onEvent((event) => {
          if (myEpoch !== epoch) return;
          const next = applyCollabEvent(get().cursors, event, self.id); // same ref when unchanged
          if (next !== get().cursors) set({ cursors: next });
          const feed = appendAnnounce(get().feed, event, self.id); // note/file announces only
          if (feed !== get().feed) set({ feed });
        });
        channel.setPresence({
          memberId: self.id,
          displayName: self.displayName,
          color: assignMemberColor(self.id),
          avatarRef: self.avatarRef,
        });
        set({ channel, status: 'live' });
      } catch (error) {
        if (myEpoch === epoch) {
          set({ status: 'error', error: error instanceof Error ? error.message : 'connect failed' });
        }
      }
    },

    disconnect: () => {
      epoch += 1;
      get().channel?.leave();
      set({ spaceId: null, self: null, status: 'idle', members: [], cursors: new Map(), feed: [], channel: null, error: null });
    },

    publishPresence: (patch) => get().channel?.setPresence(patch),
    broadcast: (event) => get().channel?.broadcast(event),
    nextSeq: () => (seq += 1),
    onEvent: (handler) => get().channel?.onEvent(handler) ?? NOOP_UNSUB,
    onRequest: (handler) => get().channel?.onRequest(handler) ?? NOOP_UNSUB,
    request: (target, req) => get().channel?.request(target, req) ?? Promise.resolve({ accepted: false }),
  };
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useLiveBlockSync.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Live page-block sync over the collab channel (see model/blockSync.ts for
 * WHY and the register design). Mounted next to useBroadcastLocalCaret in
 * SharedSpacePresenceBar, it is the ONLY bridge between the page store and
 * the content plane:
 *
 * - OUTBOUND: subscribe(usePageStore) with the previous state — every page of
 *   `spaceId` whose `content` reference changed while NOT applying a remote
 *   event is diffed and broadcast. Coalesced to at most one broadcast per page
 *   per 16 ms (one frame), the accumulate-latest pattern: the newest tree is
 *   kept and diffed against the state at the last flush, so a typed character
 *   leaves within one frame, not after the outbox's 800 ms debounce. The
 *   stamped ops are recorded in the per-page register table (module scope,
 *   keyed by pageId, never persisted) and split into ≤ 60 KB `blocks` events
 *   with ops in order.
 * - INBOUND: onEvent → `blocks` (validated at the boundary, self echo
 *   dropped, page loaded and loaded-content gate) → applyBlockOps → if the
 *   result changed, applyRemoteContent inside a guard flag so THIS store
 *   write does not re-enter the outbound side. On receive the Lamport clock
 *   absorbs every op's `v` first.
 * - FOCUSED BLOCK: an inbound `put` targeting the block the local caret is in
 *   (readLocalCaretAndSelection) where a local edit happened in the last
 *   1500 ms is held per page instead of applied, and released when the caret
 *   leaves the block or the edit goes quiet for 1500 ms — whichever first.
 *   LWW still decides on release: a newer local edit already holds a higher
 *   (v, actor), so the held op lands as a no-op instead of clobbering typing.
 * - PAGES NUDGE: a locally created/deleted/moved/retitled page broadcasts
 *   {t:'pages'} (coalesced 300 ms); an inbound one re-hydrates the named
 *   workspace's page list (coalesced 300 ms) — additive, never dropping
 *   local work.
 *
 * Not a feed source: 'blocks'/'pages' are skipped by the store's feed filter.
 * Nothing runs at all when `spaceId` is null, and everything unsubscribes on
 * unmount or space change.
 */

import { useEffect } from 'react';

import { getActivePageJwt } from '@/shared/api/client';
import { isCollabFastSendEnabled } from '@/shared/config/featureFlags';
import { subscribeDraftTap } from '@/features/block-editor/model/blockDraftStore';
import { usePageStore } from '@/store/usePageStore';
import { hydrateWorkspace } from '@/store/sync/hydratePages';
import { broadcastsSuppressed, withoutBroadcast } from '@/store/sync/broadcastGuard';
import type { Block } from '@/entities/block';
import type { BlockOp, CollabEvent } from '../model/realtimeTransport.port';
import { actorFor, randomTabId } from '../model/collabActor';
const TAB_ID = randomTabId();
import {
  absorbBlockClock,
  applyBlockOps,
  diffBlocks,
  type BlockDiffOp,
  nextBlockClock,
  recordBlockOps,
  splitBlockEvents,
  type BlockRegisterTable,
} from '../model/blockSync';
import { createFastSender } from '../model/fastSend';
import { readLocalCaretAndSelection } from '../model/localCaret';
import { recordAppliedEdits } from '../model/remoteEditStore';
import { useCollabStore } from '../store/useCollabStore';

const BROADCAST_COALESCE_MS = 16; // one frame — a typed character must leave in a frame
const NUDGE_COALESCE_MS = 300;    // sidebar churn is not keystroke-precise
const EDIT_GRACE_MS = 1500;       // focused-block hold: quiet edits release the op
const HOLD_POLL_MS = 250;         // caret-watch cadence while an op is held

/**
 * Per-page register tables live here for the session — `{key → {v, actor}}`
 * per blockSync's design; never persisted, so a page loaded fresh starts with
 * an empty table and loses to the stream until it wins one.
 */
const tables = new Map<string, BlockRegisterTable>();

/** Timestamps of THIS client's own puts (out-flush time) per page/block. */
const lastLocalEdit = new Map<string, Map<string, number>>();

/**
 * Shared guard around remote and server writes: the page-store write below fires our
 * own outbound subscriber synchronously, and it must not diff/broadcast the
 * very content it just applied.
 *
 * It covers EVERY outbound path, not just the content diff: while the flag is
 * set the store subscriber returns before it can queue a diff OR arm a pages
 * nudge, so a remote apply can never be echoed back onto the channel.
 */
export function useLiveBlockSync(spaceId: string | null, selfId: string | null, pageId: string | null = null): void {
  // Re-subscribe whenever either channel appears (joins are async) or drops.
  const channel = useCollabStore((state) => state.channel);
  const pageChannel = useCollabStore((state) => state.pageChannel);
  useEffect(() => {
    if (!spaceId || !selfId || !channel) return undefined;
    return startLiveBlockSync(spaceId, actorFor(selfId, TAB_ID), pageId);
  }, [spaceId, selfId, pageId, channel, pageChannel]);
}

function startLiveBlockSync(spaceId: string, selfId: string, pageId: string | null): () => void {
  const broadcast = useCollabStore.getState().broadcast;
  const nextSeq = useCollabStore.getState().nextSeq;

  // ── Outbound coalescing state ──────────────────────────────────────────────
  const pendingOut = new Map<string, { prev: Block[] | undefined; next: Block[]; timer: ReturnType<typeof setTimeout> }>();
  let nudgeTimer: ReturnType<typeof setTimeout> | null = null;
  let hydrateTimer: ReturnType<typeof setTimeout> | null = null;
  const hydrateQueue = new Set<string>();

  const markLastLocalEdit = (pageId: string, blockId: string) => {
    let times = lastLocalEdit.get(pageId);
    if (!times) { times = new Map(); lastLocalEdit.set(pageId, times); }
    times.set(blockId, Date.now());
  };

  const emitOps = (pageId: string, ops: BlockDiffOp[]): void => {
    // Stamp v per op (local op v = ++clock), record in the registers, split,
    // broadcast. The 60 KB splitter keeps ops in order; an op too big for
    // any event (a huge code/draw payload) is skipped inside it.
    const stamped: BlockOp[] = ops.map((op) => ({ ...op, v: nextBlockClock() }));
    tables.set(pageId, recordBlockOps(tables.get(pageId) ?? {}, stamped, selfId));
    for (const op of stamped) {
      if (op.k === 'put') markLastLocalEdit(pageId, op.id);
    }
    for (const event of splitBlockEvents(pageId, selfId, stamped, nextSeq)) broadcast(event);
  };

  const flushPage = (pageId: string): void => {
    const pending = pendingOut.get(pageId);
    if (!pending) return;
    pendingOut.delete(pageId);
    const ops = diffBlocks(pending.prev, pending.next);
    if (ops.length > 0) emitOps(pageId, ops);
  };

  const scheduleNudge = (): void => {
    if (nudgeTimer !== null) return;
    nudgeTimer = setTimeout(() => {
      nudgeTimer = null;
      broadcast({ t: 'pages', actor: selfId, seq: nextSeq(), workspaceId: spaceId });
    }, NUDGE_COALESCE_MS);
  };

  const onStoreChange = (state: ReturnType<typeof usePageStore.getState>, prev: ReturnType<typeof usePageStore.getState>): void => {
    // The guard comes FIRST: while a remote event is being applied, this
    // subscriber must not queue a diff nor arm a pages nudge — nothing this
    // client did locally, so nothing may leave the channel.
    if (broadcastsSuppressed()) return;
    const list = state.pages[spaceId];
    const prevList = prev.pages[spaceId];
    if (!list || list === prevList) return;
    const prevById = new Map((prevList ?? []).map((page) => [page._id, page]));
    // Read once for the whole store notification: a caret-block edit is the
    // only one a remote `put` may have to wait for. Stamping it HERE (not only
    // at flush) closes the ≤16 ms window between the keystroke and the frame
    // flush: a remote put arriving in that window must already see it as local.
    const caretBlockId = readLocalCaretAndSelection().caret?.blockId ?? null;

    // Pages nudge: added/removed ids, or one of the tree fields changed.
    let structural = false;
    const seen = new Set<string>();
    for (const page of list) {
      seen.add(page._id);
      const before = prevById.get(page._id);
      if (!before) structural = true;
      else if (
        before.title !== page.title
        || before.parentPageId !== page.parentPageId
        || before.sortOrder !== page.sortOrder
        || (before.icon ?? null) !== (page.icon ?? null)
      ) {
        structural = true;
      }
      // Content plane: only the page this channel is bound to may broadcast;
      // the page topic refuses any other page anyway, and diffing it here keeps
      // a background page's edits off the wire entirely.
      if (page._id !== pageId) continue;
      // Only a content-reference change while NOT applying a remote event goes
      // out (the remote applies carry the guard flag). Initial loads and new
      // pages already persist through their server write.
      if (!before || before.content === undefined || page.content === undefined) continue;
      if (before === page || before.content === page.content) continue;
      if (caretBlockId) markLastLocalEdit(page._id, caretBlockId);
      const pending = pendingOut.get(page._id);
      if (pending) {
        pending.next = page.content; // accumulate latest, diff at flush
        continue;
      }
      pendingOut.set(page._id, {
        prev: before.content, // state at the last flush — the last broadcast truth
        next: page.content,
        timer: setTimeout(() => flushPage(page._id), BROADCAST_COALESCE_MS),
      });
    }
    if (!structural) {
      for (const id of prevById.keys()) {
        if (!seen.has(id)) { structural = true; break; }
      }
    }
    if (structural) scheduleNudge();
  };

  // ── Inbound: LWW fold + focused-block hold ─────────────────────────────────
  const holds = new Map<string, Array<{ op: BlockOp; actor: string }>>();
  const holdTimers = new Map<string, ReturnType<typeof setTimeout> | undefined>();

  const deliver = (pageId: string, ops: BlockOp[], actor: string): void => {
    const page = usePageStore.getState().pageById(pageId);
    const result = applyBlockOps(page?.content, ops, actor, tables.get(pageId) ?? {});
    tables.set(pageId, result.registers); // even a lost op advances the register clock
    if (!result.changed || result.blocks === undefined) return;
    withoutBroadcast(() => {
      usePageStore.getState().applyRemoteContent(pageId, result.blocks!);
    });
    recordAppliedEdits(ops, actor, result.registers);
  };

  const releaseHold = (pageId: string, entry: { op: BlockOp; actor: string }): void => {
    deliver(pageId, [entry.op], entry.actor);
  };

  const startHoldPoll = (pageId: string): void => {
    if (holdTimers.has(pageId)) return;
    const tick = (): void => {
      const current = holds.get(pageId);
      if (!current || current.length === 0) { holdTimers.delete(pageId); return; }
      const caretBlockId = readLocalCaretAndSelection().caret?.blockId ?? null;
      const edits = lastLocalEdit.get(pageId);
      const now = Date.now();
      const remaining = current.filter((entry) =>
        entry.op.k === 'put'
        && entry.op.id === caretBlockId
        && now - (edits?.get(entry.op.id) ?? 0) < EDIT_GRACE_MS);
      for (const entry of current) {
        if (!remaining.includes(entry)) releaseHold(pageId, entry);
      }
      holds.set(pageId, remaining);
      if (remaining.length > 0) holdTimers.set(pageId, setTimeout(tick, HOLD_POLL_MS));
      else holdTimers.delete(pageId);
    };
    holdTimers.set(pageId, setTimeout(tick, HOLD_POLL_MS));
  };

  const armHold = (pageId: string, entries: Array<{ op: BlockOp; actor: string }>): void => {
    const list = holds.get(pageId) ?? [];
    list.push(...entries);
    holds.set(pageId, list);
    startHoldPoll(pageId);
  };

  const scheduleHydrate = (workspaceId: string): void => {
    hydrateQueue.add(workspaceId);
    if (hydrateTimer !== null) return;
    hydrateTimer = setTimeout(() => {
      hydrateTimer = null;
      const queue = [...hydrateQueue];
      hydrateQueue.clear();
      const jwt = getActivePageJwt();
      if (!jwt) return;
      for (const id of queue) hydrateWorkspace(id, jwt).catch(() => undefined);
    }, NUDGE_COALESCE_MS);
  };

  const onEvent = (event: CollabEvent): void => {
    if (event.t === 'pages') {
      // Re-hydrate the named workspace additively (never drops local work).
      if (event.actor !== selfId) scheduleHydrate(event.workspaceId);
      return;
    }
    if (event.t !== 'blocks' || event.actor === selfId) return; // self loopback echo
    if (!pageId || (typeof event.pageId === 'string' ? event.pageId.toLowerCase() : event.pageId) !== pageId.toLowerCase()) return; // receiver-side page guard (C502)
    // Lamport on EVERY receive, even for a page this tab has not loaded: a
    // dropped op still tells us the sender's clock, so our next local edit
    // outranks it instead of losing the LWW compare on the author's replica.
    for (const op of event.ops) absorbBlockClock(op.v);
    const targetPageId = event.pageId;
    const page = usePageStore.getState().pageById(targetPageId);
    if (!page || page.content === undefined) return; // not loaded → ops dropped; next hydrate catches it

    // Focused block: hold a put the local caret is editing this instant.
    const caretBlockId = readLocalCaretAndSelection().caret?.blockId ?? null;
    const edits = lastLocalEdit.get(targetPageId);
    const now = Date.now();
    const held: Array<{ op: BlockOp; actor: string }> = [];
    const immediate: BlockOp[] = [];
    for (const op of event.ops) {
      if (
        op.k === 'put'
        && op.id === caretBlockId
        && now - (edits?.get(op.id) ?? 0) < EDIT_GRACE_MS
      ) {
        held.push({ op, actor: event.actor });
      } else {
        immediate.push(op);
      }
    }
    if (immediate.length > 0) deliver(targetPageId, immediate, event.actor);
    if (held.length > 0) armHold(targetPageId, held);
  };

  // ── Wiring ─────────────────────────────────────────────────────────────────
  const unsubStore = usePageStore.subscribe(onStoreChange);
  // Flag off (default): no tap listener is registered, so the draft store and
  // this hook behave exactly as before.
  const unsubTap = pageId && isCollabFastSendEnabled()
    ? subscribeDraftTap(createFastSender({
        pageId,
        readContent: () => usePageStore.getState().pageById(pageId)?.content,
        emit: (ops) => emitOps(pageId, ops),
        markLocalEdit: (blockId) => markLastLocalEdit(pageId, blockId),
      }).onTap)
    : null;
  // The store fans in both channels: workspace (`pages` nudge) + this page.
  const unsubEvent = useCollabStore.getState().onEvent(onEvent);
  return () => {
    unsubStore();
    unsubTap?.();
    unsubEvent();
    for (const pending of pendingOut.values()) clearTimeout(pending.timer);
    pendingOut.clear();
    if (nudgeTimer !== null) clearTimeout(nudgeTimer);
    if (hydrateTimer !== null) clearTimeout(hydrateTimer);
    for (const timer of holdTimers.values()) {
      if (timer) clearTimeout(timer);
    }
    holdTimers.clear();
    holds.clear();
  };
}

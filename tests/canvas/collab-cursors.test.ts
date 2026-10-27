/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-cursors.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 17:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 17:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Phase 3 gate (AOC §3): the remote-cursor reducer folds caret/selection/focus/
 * nav events per actor with a monotone-seq guard, drops self + stale frames, and
 * the store routes inbound events into the cursor map. DOM geometry (caretDom /
 * localCaret) is integration-only (needs a layout engine) and is excluded here.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { applyCollabEvent, pruneStale, type CursorMap } from '@/features/collab/model/remoteCursors';
import { actorFor, memberIdOf } from '@/features/collab/model/collabActor';
import type {
  CollabEvent, PresenceState, RealtimeChannel, SummonReq, SummonRes, Unsubscribe,
} from '@/features/collab/model/realtimeTransport.port';

const caret = (actor: string, seq: number, blockId: string, offset: number): CollabEvent =>
  ({ t: 'caret', actor, seq, caret: { blockId, offset } });

test('reducer applies a remote caret and excludes self', () => {
  let cursors: CursorMap = new Map();
  cursors = applyCollabEvent(cursors, caret('me', 1, 'b1', 3), 'me');
  assert.equal(cursors.size, 0, 'own caret is never tracked (R-A1: not your own)');
  cursors = applyCollabEvent(cursors, caret('bob', 1, 'b1', 3), 'me');
  assert.deepEqual(cursors.get('bob')?.caret, { blockId: 'b1', offset: 3 });
});

test('a monotone seq guard rejects out-of-order frames', () => {
  let cursors: CursorMap = new Map();
  cursors = applyCollabEvent(cursors, caret('bob', 5, 'b1', 10), 'me');
  const afterStale = applyCollabEvent(cursors, caret('bob', 3, 'b1', 0), 'me');
  assert.equal(afterStale, cursors, 'stale frame returns the SAME ref (no re-render)');
  assert.equal(afterStale.get('bob')?.caret?.offset, 10, 'caret not rewound by the older frame');
  const fresh = applyCollabEvent(cursors, caret('bob', 6, 'b2', 1), 'me');
  assert.equal(fresh.get('bob')?.caret?.blockId, 'b2');
});

test('selection sets the range and caret; nav clears the on-page caret (§8)', () => {
  let cursors: CursorMap = new Map();
  const range = { anchor: { blockId: 'b1', offset: 0 }, focus: { blockId: 'b1', offset: 4 } };
  cursors = applyCollabEvent(cursors, { t: 'selection', actor: 'amy', seq: 1, range }, 'me');
  assert.deepEqual(cursors.get('amy')?.selection, range);
  assert.deepEqual(cursors.get('amy')?.caret, range.focus, 'caret follows the selection focus');

  cursors = applyCollabEvent(cursors, { t: 'nav', actor: 'amy', seq: 2, route: '/other' }, 'me');
  assert.equal(cursors.get('amy')?.caret, null, 'navigating away clears their caret here');
  assert.equal(cursors.get('amy')?.selection, null);
  assert.equal(cursors.get('amy')?.route, '/other', 'route is retained for the roster');
});

test('durable note/file announces are ignored by the cursor layer', () => {
  let cursors: CursorMap = new Map();
  cursors = applyCollabEvent(cursors, { t: 'note', actor: 'bob', noteId: 'n1', op: 'created', anchor: { blockId: 'b1' } }, 'me');
  assert.equal(cursors.size, 0, 'note announces belong to the durable feed, not cursors');
});

test('pruneStale drops cursors for departed members', () => {
  let cursors: CursorMap = new Map();
  cursors = applyCollabEvent(cursors, caret('bob', 1, 'b1', 1), 'me');
  cursors = applyCollabEvent(cursors, caret('amy', 1, 'b1', 1), 'me');
  const pruned = pruneStale(cursors, new Set(['amy']));
  assert.deepEqual([...pruned.keys()], ['amy'], 'bob (gone) is dropped');
  const noChange = pruneStale(pruned, new Set(['amy']));
  assert.equal(noChange, pruned, 'no departures returns the SAME ref');
});

/** Fake channel exposing the registered event + presence handlers to the test. */
class FakeChannel implements RealtimeChannel {
  eventHandler: ((e: CollabEvent) => void) | null = null;
  presenceHandler: ((m: PresenceState[]) => void) | null = null;
  broadcast(_event: CollabEvent): void {}
  onEvent(handler: (e: CollabEvent) => void): Unsubscribe { this.eventHandler = handler; return () => {}; }
  setPresence(_patch: Partial<PresenceState>): void {}
  onPresence(handler: (m: PresenceState[]) => void): Unsubscribe { this.presenceHandler = handler; return () => {}; }
  request(_t: string, _r: SummonReq): Promise<SummonRes> { return Promise.resolve({ accepted: false }); }
  onRequest(_h: (from: string, req: SummonReq) => Promise<SummonRes>): Unsubscribe { return () => {}; }
  leave(): void {}
}

test('the store routes inbound caret events from the PAGE channel into the cursor map', async () => {
  const { useCollabStore } = await import('@/features/collab/store/useCollabStore');
  useCollabStore.getState().disconnect();
  const workspace = new FakeChannel();
  const page = new FakeChannel();
  await useCollabStore.getState().connect('space-1', { id: 'me', displayName: 'Me' }, async () => workspace);
  await useCollabStore.getState().connectPage(
    'space-1', 'page-1', { id: 'me', displayName: 'Me' }, async () => page,
  );

  page.eventHandler?.(caret('bob', 1, 'blk', 7));
  assert.deepEqual(useCollabStore.getState().cursors.get('bob')?.caret, { blockId: 'blk', offset: 7 });

  // Page state on the workspace channel is no longer folded (C501): it is dropped.
  workspace.eventHandler?.(caret('amy', 1, 'blk', 2));
  assert.equal(useCollabStore.getState().cursors.has('amy'), false, 'workspace events never reach cursors');

  page.eventHandler?.(caret('me', 9, 'blk', 0)); // own event echoed back
  assert.equal(useCollabStore.getState().cursors.has('me'), false, 'store never renders its own caret');

  // A page presence snapshot without bob prunes bob's cursor.
  page.presenceHandler?.([{ memberId: 'me', displayName: 'Me', color: 'var(--collab-1)', route: 'page-1', lastSeen: 1 }]);
  assert.equal(useCollabStore.getState().cursors.has('bob'), false, 'departed member cursor pruned');
  useCollabStore.getState().disconnect();
});

test('memberIdOf strips the tab half and leaves bare ids alone', () => {
  for (const [actor, member] of [['u1:tabA', 'u1'], ['u1', 'u1'], ['u-2:t_3-x', 'u-2'], ['', '']]) {
    assert.equal(memberIdOf(actor), member);
  }
});

test('uid:tab cursors survive a presence snapshot keyed by memberId (table-driven)', () => {
  const uids = ['alice', 'u-1', 'A_b-9', '0f8fad5b-d9cb-469f-a165-70867728950e'];
  const tabs = ['t1', 'abc_DEF-9', 'x'.repeat(32)];
  for (const uid of uids) {
    for (const tab of tabs) {
      let cursors: CursorMap = new Map();
      cursors = applyCollabEvent(cursors, caret(actorFor(uid, tab), 1, 'b1', 2), 'me:mytab');
      assert.equal(pruneStale(cursors, new Set([uid])), cursors, `${uid}:${tab} kept while ${uid} present`);
      assert.equal(pruneStale(cursors, new Set(['other'])).size, 0, `${uid}:${tab} dropped once gone`);
    }
  }
});

test('self filter drops own events from any tab; per-tab cursors of a peer stay separate', () => {
  let cursors: CursorMap = new Map();
  cursors = applyCollabEvent(cursors, caret('me:tab2', 1, 'b1', 1), 'me:tab1');
  assert.equal(cursors.size, 0);
  cursors = applyCollabEvent(cursors, caret('bob:t1', 1, 'b1', 1), 'me:tab1');
  cursors = applyCollabEvent(cursors, caret('bob:t2', 1, 'b1', 5), 'me:tab1');
  assert.deepEqual([...cursors.keys()], ['bob:t1', 'bob:t2']);
});

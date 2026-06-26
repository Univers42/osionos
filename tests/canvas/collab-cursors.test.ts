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

test('the store routes inbound caret events into the cursor map', async () => {
  const { useCollabStore } = await import('@/features/collab/store/useCollabStore');
  useCollabStore.getState().disconnect();
  const channel = new FakeChannel();
  await useCollabStore.getState().connect('space-1', { id: 'me', displayName: 'Me' }, async () => channel);

  channel.eventHandler?.(caret('bob', 1, 'blk', 7));
  assert.deepEqual(useCollabStore.getState().cursors.get('bob')?.caret, { blockId: 'blk', offset: 7 });

  channel.eventHandler?.(caret('me', 9, 'blk', 0)); // own event echoed back
  assert.equal(useCollabStore.getState().cursors.has('me'), false, 'store never renders its own caret');

  // A presence snapshot without bob prunes bob's cursor.
  channel.presenceHandler?.([{ memberId: 'me', displayName: 'Me', color: 'var(--collab-1)', route: '/', lastSeen: 1 }]);
  assert.equal(useCollabStore.getState().cursors.has('bob'), false, 'departed member cursor pruned');
  useCollabStore.getState().disconnect();
});

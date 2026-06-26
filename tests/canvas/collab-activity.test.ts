/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-activity.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Phase 4 gate (AOC §4): activity/nav events map to calm, throttled labels, and
 * the store folds a remote `focus` event into the cursor's focusedElementId
 * (the active-control pulse source). The store hands out ONE monotone seq across
 * all outbound ephemeral events so a remote reducer can order the whole stream.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { describeSignal, shouldSurface, ACTIVITY_THROTTLE_MS } from '@/features/collab/model/activitySignals';
import type {
  CollabEvent, PresenceState, RealtimeChannel, SummonReq, SummonRes, Unsubscribe,
} from '@/features/collab/model/realtimeTransport.port';

test('describeSignal maps nav + activity kinds, ignores cursor events', () => {
  assert.equal(describeSignal({ t: 'nav', actor: 'a', seq: 1, route: '/p' }, 'Amy'), 'Amy moved to another page');
  assert.equal(describeSignal({ t: 'activity', actor: 'a', seq: 1, kind: 'created-block', targetId: 'b' }, 'Bob'), 'Bob added a block');
  assert.equal(describeSignal({ t: 'activity', actor: 'a', seq: 1, kind: 'opened-panel', targetId: 'x' }, 'Zoe'), 'Zoe opened a panel');
  assert.equal(describeSignal({ t: 'caret', actor: 'a', seq: 1, caret: { blockId: 'b', offset: 0 } }, 'Amy'), null);
});

test('shouldSurface throttles per actor', () => {
  const last = new Map<string, number>();
  assert.equal(shouldSurface(last, 'bob', 10_000), true);
  last.set('bob', 10_000);
  assert.equal(shouldSurface(last, 'bob', 10_000 + ACTIVITY_THROTTLE_MS - 1), false, 'too soon');
  assert.equal(shouldSurface(last, 'bob', 10_000 + ACTIVITY_THROTTLE_MS), true, 'past the window');
  assert.equal(shouldSurface(last, 'amy', 10_000 + 1), true, 'a different actor is independent');
});

class FakeChannel implements RealtimeChannel {
  eventHandler: ((e: CollabEvent) => void) | null = null;
  broadcast(_event: CollabEvent): void {}
  onEvent(handler: (e: CollabEvent) => void): Unsubscribe { this.eventHandler = handler; return () => {}; }
  setPresence(_patch: Partial<PresenceState>): void {}
  onPresence(_handler: (m: PresenceState[]) => void): Unsubscribe { return () => {}; }
  request(_t: string, _r: SummonReq): Promise<SummonRes> { return Promise.resolve({ accepted: false }); }
  onRequest(_h: (from: string, req: SummonReq) => Promise<SummonRes>): Unsubscribe { return () => {}; }
  leave(): void {}
}

test('the store folds a remote focus event into the active-control source', async () => {
  const { useCollabStore } = await import('@/features/collab/store/useCollabStore');
  useCollabStore.getState().disconnect();
  const channel = new FakeChannel();
  await useCollabStore.getState().connect('space-1', { id: 'me', displayName: 'Me' }, async () => channel);

  channel.eventHandler?.({ t: 'focus', actor: 'bob', seq: 1, elementId: 'toolbar.bold' });
  assert.equal(useCollabStore.getState().cursors.get('bob')?.focusedElementId, 'toolbar.bold');

  channel.eventHandler?.({ t: 'focus', actor: 'bob', seq: 2, elementId: null });
  assert.equal(useCollabStore.getState().cursors.get('bob')?.focusedElementId, null, 'blur clears the pulse');
  useCollabStore.getState().disconnect();
});

test('nextSeq is monotone and shared across outbound event types', async () => {
  const { useCollabStore } = await import('@/features/collab/store/useCollabStore');
  const a = useCollabStore.getState().nextSeq();
  const b = useCollabStore.getState().nextSeq();
  const c = useCollabStore.getState().nextSeq();
  assert.ok(a < b && b < c, 'strictly increasing — no two ephemeral frames share a seq');
});

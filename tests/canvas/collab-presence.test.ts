/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-presence.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 16:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 16:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Phase 2 gate (AOC §6): the pure presence projection and the collab store wire
 * a presence snapshot into a stable, self-excluded roster, and connect/disconnect
 * are epoch-safe. No transport: the store is driven by a fake RealtimeChannel.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignMemberColor, rosterFromSnapshot, splitRoster, memberInitials, COLLAB_PALETTE_SIZE,
} from '@/features/collab/model/collabPresence';
import type {
  CollabEvent, PresenceState, RealtimeChannel, SummonReq, SummonRes, Unsubscribe,
} from '@/features/collab/model/realtimeTransport.port';

function presence(memberId: string, displayName: string): PresenceState {
  return { memberId, displayName, color: 'var(--collab-1)', route: '/', lastSeen: 1 };
}

/** A fake channel: captures presence pushes so the test can replay a snapshot. */
class FakeChannel implements RealtimeChannel {
  presenceHandler: ((m: PresenceState[]) => void) | null = null;
  selfPresence: Partial<PresenceState> | null = null;
  left = false;
  broadcast(_event: CollabEvent): void {}
  onEvent(_handler: (e: CollabEvent) => void): Unsubscribe { return () => {}; }
  setPresence(patch: Partial<PresenceState>): void { this.selfPresence = patch; }
  onPresence(handler: (m: PresenceState[]) => void): Unsubscribe {
    this.presenceHandler = handler;
    return () => { this.presenceHandler = null; };
  }
  request(_target: string, _req: SummonReq): Promise<SummonRes> { return Promise.resolve({ accepted: false }); }
  onRequest(_h: (from: string, req: SummonReq) => Promise<SummonRes>): Unsubscribe { return () => {}; }
  leave(): void { this.left = true; }
}

test('assignMemberColor is deterministic and within the palette (R-A8)', () => {
  const a = assignMemberColor('user-alpha');
  assert.equal(a, assignMemberColor('user-alpha'), 'stable across calls');
  for (let i = 0; i < 50; i += 1) {
    const token = assignMemberColor(`u${i}`);
    assert.match(token, /^var\(--collab-[1-8]\)$/, 'always a --collab-N token, never raw hex');
    const n = Number(token.replace(/\D/g, ''));
    assert.ok(n >= 1 && n <= COLLAB_PALETTE_SIZE);
  }
  assert.equal(memberInitials('Dylan Lesieur'), 'DY');
  assert.equal(memberInitials('  '), '?');
});

test('rosterFromSnapshot dedups, drops self, and sorts by name', () => {
  const snapshot = [
    presence('me', 'Me'),
    presence('zoe', 'Zoe'),
    presence('amy', 'Amy'),
    { ...presence('amy', 'Amy (newer)'), lastSeen: 9 }, // dup memberId → last wins
  ];
  const roster = rosterFromSnapshot(snapshot, 'me');
  assert.deepEqual(roster.map((m) => m.memberId), ['amy', 'zoe'], 'self excluded, name-sorted, deduped');
  assert.equal(roster[0].displayName, 'Amy (newer)', 'duplicate collapses to the last seen');
});

test('splitRoster collapses overflow into +N', () => {
  const many = Array.from({ length: 9 }, (_, i) => presence(`u${i}`, `U${i}`));
  const { shown, overflow } = splitRoster(many, 5);
  assert.equal(shown.length, 4);
  assert.equal(overflow, 5);
  const few = many.slice(0, 3);
  assert.deepEqual(splitRoster(few, 5), { shown: few, overflow: 0 });
});

test('collab store projects presence into the roster and tears down on disconnect', async () => {
  const { useCollabStore } = await import('@/features/collab/store/useCollabStore');
  useCollabStore.getState().disconnect();

  const channel = new FakeChannel();
  await useCollabStore.getState().connect(
    'space-1',
    { id: 'me', displayName: 'Me' },
    async () => channel,
  );

  assert.equal(useCollabStore.getState().status, 'live');
  assert.equal(channel.selfPresence?.memberId, 'me', 'published its own presence on join');
  assert.match(String(channel.selfPresence?.color), /^var\(--collab-[1-8]\)$/);

  channel.presenceHandler?.([presence('me', 'Me'), presence('bob', 'Bob')]);
  const members = useCollabStore.getState().members;
  assert.deepEqual(members.map((m) => m.memberId), ['bob'], 'roster excludes self');

  useCollabStore.getState().disconnect();
  assert.equal(channel.left, true, 'disconnect leaves the channel');
  assert.equal(useCollabStore.getState().status, 'idle');
  assert.deepEqual(useCollabStore.getState().members, []);
});

test('a superseding connect tears down the stale channel (epoch guard)', async () => {
  const { useCollabStore } = await import('@/features/collab/store/useCollabStore');
  useCollabStore.getState().disconnect();

  const stale = new FakeChannel();
  const fresh = new FakeChannel();
  let release: (() => void) | null = null;
  const slowJoin = new Promise<RealtimeChannel>((resolve) => { release = () => resolve(stale); });

  // Kick off a slow connect, then a second connect before the first resolves.
  const first = useCollabStore.getState().connect('space-A', { id: 'me', displayName: 'Me' }, () => slowJoin);
  await useCollabStore.getState().connect('space-B', { id: 'me', displayName: 'Me' }, async () => fresh);
  release?.();
  await first;

  assert.equal(stale.left, true, 'the superseded (stale) join is torn down');
  assert.equal(useCollabStore.getState().spaceId, 'space-B', 'the latest connect wins');
  assert.equal(useCollabStore.getState().channel, fresh);
  useCollabStore.getState().disconnect();
});

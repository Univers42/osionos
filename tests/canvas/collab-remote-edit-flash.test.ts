/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-remote-edit-flash.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Remote edit flash and typing activity (model/remoteEditFlash.ts,
 * typingActivity.ts, remoteEditStore.ts): the pure rules behind the tint over a
 * block a collaborator just changed and the three-dot badge on their avatar.
 * "Applied" is checked against the real LWW fold (applyBlockOps), not a copy of
 * it, so an op that lost the register race is proven NOT to flash.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { applyBlockOps, type BlockRegisterTable } from '@/features/collab/model/blockSync';
import type { BlockOp } from '@/features/collab/model/realtimeTransport.port';
import {
  appliedOps, FLASH_MAX, FLASH_TTL_MS, liveFlashes, nextFlashExpiry, recordFlash, type EditFlash,
} from '@/features/collab/model/remoteEditFlash';
import { recordAppliedEdits, useRemoteEditStore } from '@/features/collab/model/remoteEditStore';
import {
  nextTypingExpiry, noteEdit, TYPING_IDLE_MS, typingMembers,
} from '@/features/collab/model/typingActivity';

const put = (id: string, v: number, content = 'x'): BlockOp =>
  ({ k: 'put', id, parentId: null, block: { id, type: 'paragraph', content }, v });
const order = (ids: string[], v: number): BlockOp => ({ k: 'order', parentId: null, ids, v });
const flash = (blockId: string, at: number, actor = 'amy:t1'): EditFlash => ({ blockId, actor, at });

test.beforeEach(() => useRemoteEditStore.setState({ flashes: [], editedAt: {} }));

test('recordFlash adds a flash and never mutates the list it was given', () => {
  const before = [flash('a', 100)];
  const after = recordFlash(before, flash('b', 200));
  assert.deepEqual(after.map((entry) => entry.blockId), ['a', 'b']);
  assert.equal(before.length, 1, 'input untouched');
});

test('a second edit of the same block restarts its flash instead of stacking', () => {
  const list = recordFlash([flash('a', 100)], flash('a', 400, 'bob:t2'));
  assert.deepEqual(list, [flash('a', 400, 'bob:t2')]);
});

test('recordFlash drops flashes already expired at the new entry time', () => {
  const list = recordFlash([flash('a', 100), flash('b', 600)], flash('c', 100 + FLASH_TTL_MS));
  assert.deepEqual(list.map((entry) => entry.blockId), ['b', 'c'], 'a is exactly TTL old, so gone; b is live');
});

test(`at most ${FLASH_MAX} flashes live, the newest kept`, () => {
  let list: readonly EditFlash[] = [];
  for (let n = 0; n < FLASH_MAX + 6; n += 1) list = recordFlash(list, flash(`b${n}`, 1000 + n));
  assert.equal(list.length, FLASH_MAX);
  assert.equal(list[0].blockId, 'b6', 'the six oldest were dropped');
  assert.equal(list[FLASH_MAX - 1].blockId, `b${FLASH_MAX + 5}`);
});

test('liveFlashes expires at the TTL boundary and keeps the same array when nothing expired', () => {
  const list = [flash('a', 100), flash('b', 500)];
  assert.equal(liveFlashes(list, 100 + FLASH_TTL_MS - 1), list, 'same reference: no store write');
  assert.deepEqual(liveFlashes(list, 100 + FLASH_TTL_MS).map((entry) => entry.blockId), ['b']);
  assert.deepEqual(liveFlashes(list, 500 + FLASH_TTL_MS), []);
});

test('nextFlashExpiry is the time until the first flash ends, or null', () => {
  assert.equal(nextFlashExpiry([], 0), null);
  assert.equal(nextFlashExpiry([flash('a', 100), flash('b', 300)], 150), 100 + FLASH_TTL_MS - 150);
  assert.equal(nextFlashExpiry([flash('a', 100)], 100 + FLASH_TTL_MS), null, 'already over');
});

test('appliedOps keeps the ops that won the register and drops the one that lost', () => {
  const first = applyBlockOps(undefined, [put('b1', 9)], 'amy:t1', {});
  const stale = [put('b1', 3, 'old'), put('b2', 4)];
  const second = applyBlockOps(first.blocks, stale, 'bob:t2', first.registers);
  const credited = appliedOps(stale, 'bob:t2', second.registers);
  assert.deepEqual(credited.map((op) => (op as { id: string }).id), ['b2'], 'b1 at v3 lost to v9');
});

test('a tie on version is decided by actor, and only the winner is credited', () => {
  const ops = [put('b1', 5)];
  const amy = applyBlockOps(undefined, ops, 'amy:t1', {});
  const zed = applyBlockOps(amy.blocks, [put('b1', 5, 'zed')], 'zed:t1', amy.registers);
  assert.equal(appliedOps(ops, 'amy:t1', zed.registers).length, 0, 'zed outranked amy at v5');
  assert.equal(appliedOps([put('b1', 5, 'zed')], 'zed:t1', zed.registers).length, 1);
});

test('an order op is credited through its parent register', () => {
  const ops = [order(['b1', 'b2'], 7)];
  const result = applyBlockOps(undefined, ops, 'amy:t1', {});
  assert.equal(appliedOps(ops, 'amy:t1', result.registers).length, 1);
  assert.equal(appliedOps(ops, 'amy:t1', {} as BlockRegisterTable).length, 0, 'an empty table credits nothing');
});

test('record flashes puts only, and counts every applied op as typing', () => {
  useRemoteEditStore.getState().record([put('b1', 2), order(['b1'], 3)], 'amy:t1', 1000);
  const { flashes, editedAt } = useRemoteEditStore.getState();
  assert.deepEqual(flashes, [flash('b1', 1000)]);
  assert.deepEqual(editedAt, { amy: 1000 });
});

test('record with no ops writes nothing', () => {
  const before = useRemoteEditStore.getState();
  before.record([], 'amy:t1', 1000);
  assert.equal(useRemoteEditStore.getState().flashes, before.flashes);
  assert.equal(useRemoteEditStore.getState().editedAt, before.editedAt);
});

test('recordAppliedEdits skips an op that lost, so a stale write never flashes', () => {
  const won = applyBlockOps(undefined, [put('b1', 9)], 'amy:t1', {});
  const stale = [put('b1', 3)];
  const lost = applyBlockOps(won.blocks, stale, 'bob:t2', won.registers);
  recordAppliedEdits(stale, 'bob:t2', lost.registers, 2000);
  assert.deepEqual(useRemoteEditStore.getState().flashes, []);
  assert.deepEqual(useRemoteEditStore.getState().editedAt, {}, 'and bob is not shown typing');
});

test('prune drops expired flashes and writes nothing while all are live', () => {
  useRemoteEditStore.getState().record([put('b1', 2)], 'amy:t1', 1000);
  const live = useRemoteEditStore.getState().flashes;
  useRemoteEditStore.getState().prune(1000 + FLASH_TTL_MS - 1);
  assert.equal(useRemoteEditStore.getState().flashes, live, 'same reference: no subscriber wakes');
  useRemoteEditStore.getState().prune(1000 + FLASH_TTL_MS);
  assert.deepEqual(useRemoteEditStore.getState().flashes, []);
});

test('noteEdit stamps a member and prunes the ones gone idle, so the record stays bounded', () => {
  const first = noteEdit({}, 'amy', 100);
  const second = noteEdit(first, 'bob', 100 + TYPING_IDLE_MS);
  assert.deepEqual(second, { bob: 100 + TYPING_IDLE_MS }, 'amy idled out at exactly the window');
  assert.deepEqual(noteEdit(second, 'bob', 5000), { bob: 5000 }, 'a restamp replaces, not adds');
});

test('typingMembers is true for 1.5 s after the last edit and not a ms longer', () => {
  const edited = { amy: 1000 };
  assert.deepEqual([...typingMembers(edited, 1000 + TYPING_IDLE_MS - 1)], ['amy']);
  assert.deepEqual([...typingMembers(edited, 1000 + TYPING_IDLE_MS)], []);
});

test('nextTypingExpiry points at the soonest idle moment, or null when nobody types', () => {
  assert.equal(nextTypingExpiry({}, 0), null);
  assert.equal(nextTypingExpiry({ amy: 1000, bob: 1400 }, 1500), 1000 + TYPING_IDLE_MS - 1500);
  assert.equal(nextTypingExpiry({ amy: 1000 }, 1000 + TYPING_IDLE_MS), null);
});

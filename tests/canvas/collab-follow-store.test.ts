/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-follow-store.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Follow mode state (model/followStore.ts): who the editor is tracking, and the
 * rules that end it. The scroll loop itself needs a layout engine and is not
 * covered here; what decides whether it runs is.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { useFollowStore } from '@/features/collab/model/followStore';
import type { CursorMap } from '@/features/collab/model/remoteCursors';

const cursorFor = (actor: string): CursorMap =>
  new Map([[actor, {
    actor, seq: 1, caret: { blockId: 'b1', offset: 0 }, selection: null,
    focusedElementId: null, route: null, movedAt: 1,
  }]]);

const present = (...ids: string[]): ReadonlySet<string> => new Set(ids);

test.beforeEach(() => useFollowStore.getState().stop());

test('follow starts tracking one actor; stop clears it', () => {
  assert.equal(useFollowStore.getState().following, null, 'nobody is followed by default');
  useFollowStore.getState().follow('amy:t1');
  assert.equal(useFollowStore.getState().following, 'amy:t1');
  useFollowStore.getState().stop();
  assert.equal(useFollowStore.getState().following, null);
});

test('following another actor replaces the first (one at a time)', () => {
  useFollowStore.getState().follow('amy:t1');
  useFollowStore.getState().follow('bob:t9');
  assert.equal(useFollowStore.getState().following, 'bob:t9');
});

test('stop with nobody followed does not notify subscribers', () => {
  let calls = 0;
  const unsubscribe = useFollowStore.subscribe(() => { calls += 1; });
  useFollowStore.getState().stop();
  unsubscribe();
  assert.equal(calls, 0, 'a no-op stop must not re-render the follow layer');
});

test('releaseIfGone keeps a follow while the cursor and the member are both present', () => {
  useFollowStore.getState().follow('amy:t1');
  useFollowStore.getState().releaseIfGone(cursorFor('amy:t1'), present('amy', 'bob'));
  assert.equal(useFollowStore.getState().following, 'amy:t1');
});

test('releaseIfGone ends the follow when the member left the space', () => {
  useFollowStore.getState().follow('amy:t1');
  useFollowStore.getState().releaseIfGone(cursorFor('amy:t1'), present('bob'));
  assert.equal(useFollowStore.getState().following, null);
});

test('releaseIfGone ends the follow when that tab no longer has a cursor', () => {
  useFollowStore.getState().follow('amy:t1');
  useFollowStore.getState().releaseIfGone(cursorFor('amy:t2'), present('amy'));
  assert.equal(useFollowStore.getState().following, null, 'another tab of amy is not the one followed');
});

test('releaseIfGone does nothing when nobody is followed', () => {
  useFollowStore.getState().releaseIfGone(new Map(), present());
  assert.equal(useFollowStore.getState().following, null);
});

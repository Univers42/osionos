/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-roster-menu.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The roster avatar menu (model/rosterMenu.ts): what a member offers and why an
 * action is unavailable, which of their tabs Jump and Follow point at, how the
 * keyboard moves the active row, and where the popover sits. All of it is data in,
 * verdict out, so it runs here without a DOM; the component only draws it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { RemoteCursor } from '@/features/collab/model/remoteCursors';
import {
  MENU_CLOSED, MENU_WIDTH, menuReducer, pickCaretActor, placeMenu, rosterMenuItems,
  type MenuState,
} from '@/features/collab/model/rosterMenu';

const cursor = (actor: string, movedAt: number, caret = true): RemoteCursor => ({
  actor, seq: 1, caret: caret ? { blockId: 'b1', offset: 0 } : null, selection: null,
  focusedElementId: null, route: null, movedAt,
});
const byActor = (...list: RemoteCursor[]): ReadonlyMap<string, RemoteCursor> =>
  new Map(list.map((entry) => [entry.actor, entry]));

const input = { onPage: true, caretActor: 'amy:t1', followed: false, canSummon: true };
const open = (active = 0): MenuState => ({ openFor: 'amy', active });

test('a member on this page with a caret offers every action enabled', () => {
  const items = rosterMenuItems(input);
  assert.deepEqual(items.map((item) => item.id), ['jump', 'follow', 'summon']);
  assert.ok(items.every((item) => item.enabled && item.reason === null));
});

test('a member elsewhere in the space cannot be jumped to or followed, and the reason is shown', () => {
  const [jump, follow, summon] = rosterMenuItems({ ...input, onPage: false, caretActor: null });
  assert.equal(jump.enabled, false);
  assert.equal(jump.reason, 'Not on this page');
  assert.equal(follow.enabled, false);
  assert.equal(follow.reason, 'Not on this page');
  assert.equal(summon.enabled, true, 'summoning is how you bring them here');
});

test('a member on the page with no caret yet says so, not "not on this page"', () => {
  const [jump, follow] = rosterMenuItems({ ...input, caretActor: null });
  assert.equal(jump.reason, 'No cursor on this page yet');
  assert.equal(follow.reason, 'No cursor on this page yet');
});

test('while following, Follow becomes Stop following and is always enabled', () => {
  const gone = rosterMenuItems({ ...input, followed: true, onPage: false, caretActor: null });
  assert.deepEqual(gone.map((item) => item.id), ['jump', 'unfollow', 'summon']);
  assert.equal(gone[1].label, 'Stop following');
  assert.equal(gone[1].enabled, true, 'they may have left; you can still stop');
});

test('Summon is offered only when the roster can summon', () => {
  assert.deepEqual(rosterMenuItems({ ...input, canSummon: false }).map((item) => item.id), ['jump', 'follow']);
});

test('pickCaretActor takes the member tab whose caret moved last', () => {
  const cursors = byActor(cursor('amy:t1', 100), cursor('amy:t2', 300), cursor('bob:t1', 900));
  assert.equal(pickCaretActor(cursors, 'amy'), 'amy:t2');
});

test('pickCaretActor ignores tabs without a caret and other members', () => {
  const cursors = byActor(cursor('amy:t1', 100, false), cursor('bob:t1', 900));
  assert.equal(pickCaretActor(cursors, 'amy'), null);
  assert.equal(pickCaretActor(new Map(), 'amy'), null);
});

test('toggle opens a member, closes the same member, and switches to another', () => {
  const opened = menuReducer(MENU_CLOSED, { type: 'toggle', memberId: 'amy' });
  assert.deepEqual(opened, { openFor: 'amy', active: 0 });
  assert.equal(menuReducer(opened, { type: 'toggle', memberId: 'amy' }), MENU_CLOSED);
  assert.deepEqual(menuReducer(open(2), { type: 'toggle', memberId: 'bob' }), { openFor: 'bob', active: 0 });
});

test('open on the already-open member and close on a closed menu return the same state', () => {
  const state = open(1);
  assert.equal(menuReducer(state, { type: 'open', memberId: 'amy' }), state, 'ArrowDown on an open avatar keeps the row');
  assert.equal(menuReducer(MENU_CLOSED, { type: 'close' }), MENU_CLOSED);
  assert.equal(menuReducer(state, { type: 'close' }), MENU_CLOSED);
});

test('move wraps around both ends', () => {
  assert.equal(menuReducer(open(2), { type: 'move', delta: 1, count: 3 }).active, 0);
  assert.equal(menuReducer(open(0), { type: 'move', delta: -1, count: 3 }).active, 2);
  assert.equal(menuReducer(open(0), { type: 'move', delta: 1, count: 3 }).active, 1);
});

test('move and set do nothing on a closed menu or an empty list, and keep the same state', () => {
  assert.equal(menuReducer(MENU_CLOSED, { type: 'move', delta: 1, count: 3 }), MENU_CLOSED);
  assert.equal(menuReducer(MENU_CLOSED, { type: 'set', index: 2 }), MENU_CLOSED);
  const state = open(1);
  assert.equal(menuReducer(state, { type: 'move', delta: 1, count: 0 }), state);
  assert.equal(menuReducer(state, { type: 'set', index: 1 }), state, 'hover on the active row is not a render');
  assert.equal(menuReducer(state, { type: 'set', index: 2 }).active, 2);
});

test('placeMenu centres under the avatar and stays inside the viewport', () => {
  const anchor = { left: 500, right: 528, bottom: 40 };
  assert.deepEqual(placeMenu(anchor, 1280), { left: 514 - MENU_WIDTH / 2, top: 46 });
  assert.equal(placeMenu({ left: 0, right: 28, bottom: 40 }, 1280).left, 8, 'clamped to the left margin');
  assert.equal(placeMenu({ left: 1260, right: 1288, bottom: 40 }, 1280).left, 1280 - MENU_WIDTH - 8, 'clamped to the right margin');
});

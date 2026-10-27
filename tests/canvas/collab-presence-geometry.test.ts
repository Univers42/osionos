/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-presence-geometry.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Presence geometry (model/presenceGeometry.ts): the pure rules behind the remote
 * caret overlay. Every per-frame decision (which side an off-screen caret is on,
 * when the name flag collapses, when follow mode scrolls) is a number in, a
 * verdict out, so it runs here without a layout engine.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { Block } from '@/entities/block/model/types';
import {
  bandByOrder, blockOrderOf, centerDelta, classifyRect, CARET_IDLE_MS, flagPlacement,
  followScrollDelta, groupByBlock, isCaretIdle, limitWithOverflow, nextIdleDelay, visibleBoxes,
} from '@/features/collab/model/presenceGeometry';

const VIEWPORT = { top: 100, bottom: 700 }; // 600px tall

const block = (id: string, children?: Block[]): Block =>
  ({ id, type: 'paragraph', content: [], children }) as unknown as Block;

test('classifyRect: above, visible and below, with the edge counting as outside', () => {
  assert.equal(classifyRect({ top: 0, bottom: 50 }, VIEWPORT), 'above');
  assert.equal(classifyRect({ top: 60, bottom: 100 }, VIEWPORT), 'above', 'touching the top edge is hidden');
  assert.equal(classifyRect({ top: 90, bottom: 110 }, VIEWPORT), 'visible', 'straddling the top edge is visible');
  assert.equal(classifyRect({ top: 300, bottom: 320 }, VIEWPORT), 'visible');
  assert.equal(classifyRect({ top: 690, bottom: 710 }, VIEWPORT), 'visible', 'straddling the bottom edge is visible');
  assert.equal(classifyRect({ top: 700, bottom: 720 }, VIEWPORT), 'below', 'touching the bottom edge is hidden');
  assert.equal(classifyRect({ top: 900, bottom: 920 }, VIEWPORT), 'below');
});

test('visibleBoxes: keeps the lines of a selection that overlap the viewport, drops the rest', () => {
  const line = (top: number) => ({ left: 0, top, width: 200, height: 20 });
  const lines = [line(60), line(90), line(300), line(690), line(700), line(900)];
  assert.deepEqual(
    visibleBoxes(lines, VIEWPORT).map((box) => box.top),
    [90, 300, 690],
    'a line straddling an edge stays; one touching an edge, or past it, goes',
  );
  assert.deepEqual(visibleBoxes([], VIEWPORT), []);
});

test('flagPlacement: above while it fits, below once it would be clipped', () => {
  assert.equal(flagPlacement({ top: 300 }, 100), 'above');
  assert.equal(flagPlacement({ top: 118 }, 100), 'above', '16px flag + 2px gap fit exactly');
  assert.equal(flagPlacement({ top: 117 }, 100), 'below', 'one pixel short flips it');
  assert.equal(flagPlacement({ top: 100 }, 100), 'below');
  assert.equal(flagPlacement({ top: 130 }, 100, 40), 'below', 'a taller flag flips earlier');
});

test('isCaretIdle: expanded for 2.5 s after the last move, then idle', () => {
  assert.equal(CARET_IDLE_MS, 2500);
  assert.equal(isCaretIdle(1000, 1000), false);
  assert.equal(isCaretIdle(1000, 3499), false);
  assert.equal(isCaretIdle(1000, 3500), true);
  assert.equal(isCaretIdle(1000, 9000), true);
  assert.equal(isCaretIdle(0, 1_700_000_000_000), true, 'a caret never seen move (movedAt 0) starts idle');
  assert.equal(isCaretIdle(1000, 1500, 400), true, 'idleMs is a parameter');
});

test('nextIdleDelay: the soonest still-expanded caret, or null', () => {
  assert.equal(nextIdleDelay([], 1000), null);
  assert.equal(nextIdleDelay([0], 5000), null, 'already idle');
  assert.equal(nextIdleDelay([1000, 2000], 1500), 2000, '1000 idles at 3500');
  assert.equal(nextIdleDelay([4000, 1000], 1500), 2000, 'the earliest wins regardless of order');
});

test('centerDelta: signed distance from the viewport centre', () => {
  assert.equal(centerDelta({ top: 380, bottom: 420 }, VIEWPORT), 0);
  assert.equal(centerDelta({ top: 880, bottom: 920 }, VIEWPORT), 500);
  assert.equal(centerDelta({ top: -120, bottom: -80 }, VIEWPORT), -500);
});

test('followScrollDelta: null inside the inner band, the centre distance outside it', () => {
  // 20% of 600px = 120px: the resting band is 220..580.
  assert.equal(followScrollDelta({ top: 300, bottom: 320 }, VIEWPORT), null);
  assert.equal(followScrollDelta({ top: 220, bottom: 240 }, VIEWPORT), null, 'band edge is still inside');
  assert.equal(followScrollDelta({ top: 560, bottom: 580 }, VIEWPORT), null);
  assert.equal(followScrollDelta({ top: 200, bottom: 220 }, VIEWPORT), -190, 'above the band: scroll up to centre');
  assert.equal(followScrollDelta({ top: 580, bottom: 600 }, VIEWPORT), 190, 'below the band: scroll down to centre');
  assert.equal(followScrollDelta({ top: 2000, bottom: 2020 }, VIEWPORT), 1610, 'far away: the whole distance');
  assert.equal(followScrollDelta({ top: 10, bottom: 30 }, VIEWPORT), -380, 'off the top');
});

test('followScrollDelta: band is configurable and clamped; a centred tall caret settles', () => {
  assert.equal(followScrollDelta({ top: 150, bottom: 170 }, VIEWPORT, 0.05), null, '5% band: 130..670 contains it');
  assert.equal(followScrollDelta({ top: 110, bottom: 130 }, VIEWPORT, 0.05), -280);
  // 0.9 is clamped to 0.49, leaving a 394..406 resting band; unclamped it would be
  // empty and this rect (centre 403) would be told to scroll 3px.
  assert.equal(followScrollDelta({ top: 401, bottom: 405 }, VIEWPORT, 0.9), null, 'band is clamped, not inverted');
  assert.equal(followScrollDelta({ top: 150, bottom: 650 }, VIEWPORT), null, 'taller than the band but centred: no scroll');
  assert.equal(followScrollDelta({ top: 150, bottom: 651.5 }, VIEWPORT), null, 'under 1px from centre is not worth a scroll');
  assert.equal(followScrollDelta({ top: 150, bottom: 652 }, VIEWPORT), 1, '1px from centre is');
});

test('blockOrderOf: depth-first, with an index', () => {
  const order = blockOrderOf([block('a', [block('a1', [block('a1x')]), block('a2')]), block('b')]);
  assert.deepEqual(order.ids, ['a', 'a1', 'a1x', 'a2', 'b']);
  assert.equal(order.index.get('a2'), 3);
  assert.deepEqual(blockOrderOf(undefined).ids, []);
  assert.deepEqual(blockOrderOf([]).ids, []);
});

test('groupByBlock: blockId -> sorted actors, one entry per actor per block', () => {
  const grouped = groupByBlock([
    { actor: 'zed:t1', caret: { blockId: 'b1', offset: 0 }, selection: null },
    { actor: 'amy:t1', caret: { blockId: 'b1', offset: 4 }, selection: null },
    { actor: 'amy:t2', caret: { blockId: 'b2', offset: 1 }, selection: null },
    { actor: 'idle:t1', caret: null, selection: null },
  ]);
  assert.deepEqual([...grouped.keys()].sort(), ['b1', 'b2']);
  assert.deepEqual(grouped.get('b1'), ['amy:t1', 'zed:t1'], 'sorted so chips do not reshuffle');
  assert.deepEqual(grouped.get('b2'), ['amy:t2']);
});

test('groupByBlock: a selection marks every block between anchor and focus, either direction', () => {
  const order = blockOrderOf([block('a'), block('b'), block('c'), block('d')]);
  const forward = groupByBlock([{
    actor: 'amy:t1',
    caret: { blockId: 'c', offset: 2 },
    selection: { anchor: { blockId: 'a', offset: 0 }, focus: { blockId: 'c', offset: 2 } },
  }], order);
  assert.deepEqual([...forward.keys()], ['a', 'b', 'c']);
  const backward = groupByBlock([{
    actor: 'amy:t1',
    caret: { blockId: 'b', offset: 0 },
    selection: { anchor: { blockId: 'd', offset: 0 }, focus: { blockId: 'b', offset: 0 } },
  }], order);
  assert.deepEqual([...backward.keys()], ['b', 'c', 'd']);
});

test('groupByBlock: without page order a selection marks only its two ends; a lone block once', () => {
  const ends = groupByBlock([{
    actor: 'amy:t1',
    caret: { blockId: 'c', offset: 0 },
    selection: { anchor: { blockId: 'a', offset: 0 }, focus: { blockId: 'c', offset: 0 } },
  }]);
  assert.deepEqual([...ends.keys()], ['a', 'c']);
  const single = groupByBlock([{
    actor: 'amy:t1',
    caret: { blockId: 'a', offset: 3 },
    selection: { anchor: { blockId: 'a', offset: 1 }, focus: { blockId: 'a', offset: 3 } },
  }]);
  assert.deepEqual(single.get('a'), ['amy:t1']);
  const unknown = groupByBlock([{
    actor: 'amy:t1',
    caret: null,
    selection: { anchor: { blockId: 'x', offset: 0 }, focus: { blockId: 'y', offset: 0 } },
  }], blockOrderOf([block('a')]));
  assert.deepEqual([...unknown.keys()], ['x', 'y'], 'blocks the page does not know fall back to the ends');
});

test('bandByOrder: places an unmounted block by page order against the rendered window', () => {
  const order = blockOrderOf([block('a'), block('b'), block('c'), block('d'), block('e'), block('f')]);
  const rendered = ['c', 'd'];
  assert.equal(bandByOrder('a', order, rendered), 'above');
  assert.equal(bandByOrder('f', order, rendered), 'below');
  assert.equal(bandByOrder('c', order, rendered), null, 'inside the window');
  assert.equal(bandByOrder('zzz', order, rendered), null, 'not on this page');
  assert.equal(bandByOrder('a', order, []), null, 'nothing rendered: nothing to compare to');
  assert.equal(bandByOrder('a', order, ['not-on-page']), null);
});

test('limitWithOverflow: first N and the count left out', () => {
  assert.deepEqual(limitWithOverflow(['a', 'b'], 3), { shown: ['a', 'b'], overflow: 0 });
  assert.deepEqual(limitWithOverflow(['a', 'b', 'c'], 3), { shown: ['a', 'b', 'c'], overflow: 0 });
  assert.deepEqual(limitWithOverflow(['a', 'b', 'c', 'd', 'e'], 3), { shown: ['a', 'b', 'c'], overflow: 2 });
  assert.deepEqual(limitWithOverflow([], 3), { shown: [], overflow: 0 });
  assert.equal(limitWithOverflow([1, 2, 3, 4]).shown.length, 3, 'defaults to 3');
});

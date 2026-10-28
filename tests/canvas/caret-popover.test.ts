/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   caret-popover.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Where a caret menu ({{ variables, @ pages) opens. The menu's real height is unknown
// here, so a menu above the caret must hang from its bottom edge: a `top` computed from
// the height cap left a short menu floating ~240px over the caret (2026-10-28 report).

import assert from "node:assert/strict";
import test from "node:test";

import { caretPopoverStyle } from "../../src/shared/lib/dom/caretPosition.ts";
import { mulberry32 } from "./markdown-fidelity-fixtures.ts";

const viewport = (width: number, height: number) => Object.assign(globalThis, { innerWidth: width, innerHeight: height });

// The vertical span the menu may occupy, whatever its content height up to maxHeight.
function span(style: ReturnType<typeof caretPopoverStyle>, vh: number): { from: number; to: number } {
  const maxHeight = Number(style.maxHeight);
  if (style.bottom !== undefined) return { from: vh - Number(style.bottom) - maxHeight, to: vh - Number(style.bottom) };
  return { from: Number(style.top), to: Number(style.top) + maxHeight };
}

test("near the viewport bottom the menu hangs from just above the caret", () => {
  viewport(1543, 731);
  const style = caretPopoverStyle({ x: 46, y: 597, top: 577 }, 320, 360);
  assert.equal(style.top, undefined);
  assert.equal(style.bottom, 731 - (577 - 6));
  assert.equal(style.maxHeight, 360);
});

test("with room below, the menu opens under the caret", () => {
  viewport(1543, 900);
  assert.deepEqual(caretPopoverStyle({ x: 46, y: 120, top: 100 }, 320, 360), { top: 126, left: 46, maxHeight: 360 });
});

test("when neither side fits the cap, the larger side wins and the menu shrinks to it", () => {
  viewport(800, 400);
  const below = caretPopoverStyle({ x: 10, y: 150, top: 130 }, 320, 360);
  assert.equal(below.top, 156);
  assert.equal(below.maxHeight, 400 - 150 - 6 - 8);
  const above = caretPopoverStyle({ x: 10, y: 290, top: 270 }, 320, 360);
  assert.equal(above.bottom, 400 - 264);
  assert.equal(above.maxHeight, 270 - 6 - 8);
});

test("generated carets: the menu never covers the caret line and stays in the viewport", () => {
  for (let seed = 0; seed < 2000; seed += 1) {
    const random = mulberry32(seed);
    const vw = 320 + Math.floor(random() * 1600);
    const vh = 200 + Math.floor(random() * 1000);
    viewport(vw, vh);
    const top = Math.floor(random() * (vh - 24));
    const caret = { x: Math.floor(random() * vw), y: top + 16 + Math.floor(random() * 8), top };
    const style = caretPopoverStyle(caret, 320, 360);
    const { from, to } = span(style, vh);
    const where = `seed ${seed}: ${JSON.stringify({ vw, vh, caret, style })}`;
    assert.ok(to <= caret.top || from >= caret.y, `covers the caret, ${where}`);
    assert.ok(from >= 8 - 1e-9 && to <= vh - 8 + 1e-9, `leaves the viewport, ${where}`);
    assert.ok(Number(style.left) >= 8 || vw < 336, `off the left edge, ${where}`);
  }
});

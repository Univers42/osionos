/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   anchored-panel-frame.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The view-settings popover hangs off its button and never leaves the viewport.

import assert from "node:assert/strict";
import test from "node:test";

import { anchoredPanelFrame } from "../../src/shared/notion-database-sys/src/utils/geometry.ts";

const viewport = { width: 1280, height: 800 };
const button = (top: number, right: number) => ({ top, bottom: top + 28, right });

test("opens below the button, right edges aligned, scrolling in the room left", () => {
  assert.deepEqual(anchoredPanelFrame(button(100, 900), 292, viewport),
    { left: 608, top: 134, maxHeight: 658 });
});

test("flips above when below is cramped and above has more room", () => {
  assert.deepEqual(anchoredPanelFrame(button(700, 900), 292, viewport),
    { left: 608, bottom: 106, maxHeight: 686 });
});

test("stays below when below is comfortable even if above is larger", () => {
  const frame = anchoredPanelFrame(button(380, 900), 292, viewport);
  assert.equal(frame.top, 414);
  assert.equal(frame.bottom, undefined);
});

test("a button scrolled above the viewport pins the panel to the top edge", () => {
  assert.deepEqual(anchoredPanelFrame(button(-50, 900), 292, viewport), { left: 608, top: 8, maxHeight: 784 });
});

test("clamps horizontally inside the viewport margins", () => {
  assert.equal(anchoredPanelFrame(button(100, 120), 292, viewport).left, 8);
  assert.equal(anchoredPanelFrame(button(100, 1400), 292, viewport).left, 1280 - 292 - 8);
});

test("never stretches past either viewport edge, for any button position", () => {
  for (let top = -50; top <= 850; top += 37) {
    for (let right = 0; right <= 1400; right += 61) {
      const frame = anchoredPanelFrame(button(top, right), 292, viewport);
      assert.ok(frame.left >= 8 && frame.left + 292 <= 1272, `left ${frame.left}`);
      const start = frame.top ?? viewport.height - (frame.bottom ?? 0) - frame.maxHeight;
      assert.ok(start >= 8, `start ${start} at ${top},${right}`);
      assert.ok(start + frame.maxHeight <= viewport.height - 8, `end at ${top},${right}`);
    }
  }
});

test("align start hangs the panel right of the button, and flips to end when it would overflow", () => {
  const anchor = { top: 100, bottom: 128, left: 870, right: 900 };
  assert.equal(anchoredPanelFrame(anchor, 292, viewport, "start").left, 870);
  const nearEdge = { top: 100, bottom: 128, left: 1100, right: 1130 };
  assert.equal(anchoredPanelFrame(nearEdge, 292, viewport, "start").left, 1130 - 292);
});

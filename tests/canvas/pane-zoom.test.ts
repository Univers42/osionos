/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pane-zoom.test.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 02:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 02:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Per-pane zoom: Ctrl +/-/0 and Ctrl+wheel act on the pane the user selected,
// and on nothing else. These are the pure rules behind it — the ladder, what a
// stored value is allowed to be, which pane a click selects, and the key
// combos. The DOM side is covered by the workspace-zoom e2e scenarios.

import assert from "node:assert/strict";
import test from "node:test";

import {
  nextSelectedPane,
  normalizePaneZoom,
  stepPaneZoom,
  wheelZoom,
  withPaneZoom,
} from "../../src/widgets/workspace-grid/model/paneZoom.ts";
import { freshLayout } from "../../src/widgets/workspace-grid/model/layoutPersist.ts";
import { cssZoomOf, toCssPx, toOnScreenPx } from "../../src/shared/lib/dom/cssZoom.ts";
import { measureScrollMargin } from "../../src/entities/block/model/blockVirtualization.ts";
import { resolveRowDropSlot } from "../../src/features/block-editor/ui/table/tableCaretDom.ts";
import { findPane, type LayoutNode, type PaneNode } from "../../src/widgets/workspace-grid/model/layoutTree.ts";
import { DEFAULT_AUTOMATIONS } from "../../src/features/automations/model/defaultAutomations.ts";
import { comboSteps, normalizeComboFromEvent } from "../../src/features/automations/model/combo.ts";

const pane = (id: string, zoom?: number): PaneNode =>
  ({ type: "pane", id, tabs: [], activeTabId: null, ...(zoom === undefined ? {} : { zoom }) });
const split = (...children: LayoutNode[]): LayoutNode =>
  ({ type: "split", id: "split-1", direction: "row", children, sizes: children.map(() => 100 / children.length) });

test("stepPaneZoom walks the browser's ladder and stops at 50% and 200%", () => {
  assert.equal(stepPaneZoom(1, "in"), 1.1);
  assert.equal(stepPaneZoom(1.1, "in"), 1.25);
  assert.equal(stepPaneZoom(1, "out"), 0.9);
  assert.equal(stepPaneZoom(0.9, "out"), 0.8);
  assert.equal(stepPaneZoom(2, "in"), 2);
  assert.equal(stepPaneZoom(0.5, "out"), 0.5);
});

test("stepPaneZoom from a value off the ladder moves to the next rung in that direction", () => {
  assert.equal(stepPaneZoom(1.2, "in"), 1.25);
  assert.equal(stepPaneZoom(1.2, "out"), 1.1);
});

test("normalizePaneZoom: anything that is not a number in 50–200% reads as a safe value", () => {
  for (const junk of [undefined, null, Number.NaN, "1.5", {}, 0, -1]) assert.equal(normalizePaneZoom(junk), 1);
  assert.equal(normalizePaneZoom(1.25), 1.25);
  assert.equal(normalizePaneZoom(9), 2);
  assert.equal(normalizePaneZoom(0.1), 0.5);
});

test("withPaneZoom changes one pane and leaves the others the same objects", () => {
  const left = pane("left");
  const right = pane("right");
  const zoomed = withPaneZoom(split(left, right), "left", 1.25);
  assert.equal(findPane(zoomed, "left")?.zoom, 1.25);
  assert.equal(findPane(zoomed, "right"), right);
});

test("withPaneZoom back to 100% drops the field, so an unzoomed pane is stored as before", () => {
  const reset = withPaneZoom(pane("only", 1.5), "only", 1);
  assert.deepEqual(reset, { type: "pane", id: "only", tabs: [], activeTabId: null });
});

test("nextSelectedPane: a pane selects, the rest of the app deselects, a portaled menu changes nothing", () => {
  assert.equal(nextSelectedPane(null, { paneId: "left", insideApp: true }), "left");
  assert.equal(nextSelectedPane("left", { paneId: "right", insideApp: true }), "right");
  assert.equal(nextSelectedPane("left", { paneId: null, insideApp: true }), null);
  assert.equal(nextSelectedPane("left", { paneId: null, insideApp: false }), "left");
});

const zoomCombos = (commandId: string): string[] =>
  DEFAULT_AUTOMATIONS.filter((a) => a.enabled && a.actions[0]?.commandId === commandId).flatMap((a) => comboSteps(a.trigger.combo));
const pressed = (init: Partial<KeyboardEvent>): string =>
  normalizeComboFromEvent({ ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, key: "", ...init } as KeyboardEvent);

test("the keys a browser zooms with are bound to the pane commands, on QWERTY, AZERTY and the numpad", () => {
  const zoomIn = zoomCombos("zoomPaneIn");
  const zoomOut = zoomCombos("zoomPaneOut");
  const reset = zoomCombos("zoomPaneReset");
  // QWERTY: Ctrl+= and Ctrl+Shift+= ("+"); numpad "+" arrives as key "+" without shift.
  for (const event of [{ key: "=" }, { key: "+", shiftKey: true }, { key: "+" }]) assert.ok(zoomIn.includes(pressed(event)), `zoom in: ${pressed(event)}`);
  // Ctrl+Shift+- arrives as "_"; without it zoom in would hit the pane and zoom out the page.
  for (const event of [{ key: "-" }, { key: "_", shiftKey: true }]) assert.ok(zoomOut.includes(pressed(event)), `zoom out: ${pressed(event)}`);
  // AZERTY types "0" with Shift held; without it the key gives "à".
  for (const event of [{ key: "0" }, { key: "0", shiftKey: true }, { key: "à" }]) assert.ok(reset.includes(pressed(event)), `reset: ${pressed(event)}`);
});

test("a fresh layout starts at 100%", () => {
  assert.equal(freshLayout().root.zoom, undefined);
});

/** Feeds a run of wheel deltas through wheelZoom the way the listener does. */
function wheelSteps(deltas: number[], isPixelDelta = true): string[] {
  const steps: string[] = [];
  let travelled = 0;
  for (const deltaY of deltas) {
    const next = wheelZoom(travelled, deltaY, isPixelDelta);
    travelled = next.travelled;
    if (next.change) steps.push(next.change);
  }
  return steps;
}

test("wheelZoom: one notch is one step whatever size the mouse reports it as", () => {
  for (const notch of [53, 100, 120]) {
    assert.deepEqual(wheelSteps([-notch]), ["in"], `${notch}px notch`);
    assert.deepEqual(wheelSteps([notch, notch, notch]), ["out", "out", "out"], `three ${notch}px notches`);
  }
  // Firefox reports a notch as 3 lines, not pixels.
  assert.deepEqual(wheelSteps([-3, -3], false), ["in", "in"]);
});

test("wheelZoom: a pinch's burst of small deltas is summed, and a change of direction starts over", () => {
  // 13 events, 150px in total: three steps, not thirteen.
  const pinch = [-2, -5, -9, -14, -18, -20, -20, -18, -15, -12, -9, -5, -3];
  assert.deepEqual(wheelSteps(pinch), ["in", "in", "in"]);
  assert.deepEqual(wheelSteps([-40, 40]), []);
  assert.deepEqual(wheelSteps([-40, 30, 30]), ["out"]);
  assert.deepEqual(wheelSteps([0, 0]), []);
});

const zoomed = (zoom: number): Element => ({ currentCSSZoom: zoom }) as unknown as Element;

test("cssZoom converts between on-screen px and the CSS px of a zoomed element", () => {
  assert.equal(cssZoomOf(zoomed(1.25)), 1.25);
  assert.equal(toCssPx(100, zoomed(1.25)), 80);
  assert.equal(toOnScreenPx(80, zoomed(1.25)), 100);
  assert.equal(toCssPx(100, zoomed(0.8)), 125);
  // No element, or a browser that does not report zoom: lengths pass through.
  assert.equal(toCssPx(100, null), 100);
  assert.equal(toCssPx(100, {} as unknown as Element), 100);
  assert.equal(cssZoomOf(zoomed(0)), 1);
});

const boxAt = (top: number, extra: object = {}): HTMLElement =>
  ({ getBoundingClientRect: () => ({ top, bottom: top + 40, height: 40 }), ...extra }) as unknown as HTMLElement;

test("measureScrollMargin is in the scroller's CSS px and does not move when the page scrolls", () => {
  // Zoom 1.25: the list starts 250 on-screen px below the scroller's top, which is 200 of its CSS px.
  assert.equal(measureScrollMargin(boxAt(350), boxAt(100, { scrollTop: 0, currentCSSZoom: 1.25 })), 200);
  // Scrolled by 80 CSS px the list sits 100 on-screen px higher; the margin is the same.
  assert.equal(measureScrollMargin(boxAt(250), boxAt(100, { scrollTop: 80, currentCSSZoom: 1.25 })), 200);
  assert.equal(measureScrollMargin(boxAt(350), boxAt(100, { scrollTop: 0 })), 250);
});

test("resolveRowDropSlot places the drop line in the table root's CSS px", () => {
  const rows = [boxAt(200), boxAt(240), boxAt(280)];
  const table = { querySelectorAll: () => rows } as unknown as HTMLElement;
  // Pointer in the upper half of the third row, table root at y=100, pane zoomed to 125%.
  assert.deepEqual(resolveRowDropSlot(table, boxAt(100, { currentCSSZoom: 1.25 }), 290), { slot: 2, indicatorY: 144 });
  // Below the last row: the line goes under it.
  assert.deepEqual(resolveRowDropSlot(table, boxAt(100, { currentCSSZoom: 1.25 }), 400), { slot: 3, indicatorY: 176 });
  assert.deepEqual(resolveRowDropSlot(table, boxAt(100), 290), { slot: 2, indicatorY: 180 });
});

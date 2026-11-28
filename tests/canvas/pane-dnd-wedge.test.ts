/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pane-dnd-wedge.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Regression: splitting by dragging a tab unmounts the drag SOURCE, so its
// dragend never fires — dragKind wedged "on" and every pane's drop-capture
// overlay blocked all editing until reload. The store's window-level safety
// net must reset the drag after any drop/dragend, deferred one tick so live
// drop handlers still read the active state.

import assert from "node:assert/strict";
import test from "node:test";

import "./window-events.ts";
import { useDragSession } from "../../src/store/dragSession.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test("drag state always resets after a drop, even when the source unmounted", async () => {
  useDragSession.getState().beginTabDrag();
  assert.equal(useDragSession.getState().dragKind, "tab");
  // The browser delivers window-capture `drop` regardless of source unmount.
  globalThis.dispatchEvent(new Event("drop"));
  // Same tick: bubble-phase drop handlers must still see the active drag.
  assert.equal(useDragSession.getState().dragKind, "tab", "reset is deferred past the event cycle");
  await tick();
  assert.equal(useDragSession.getState().dragKind, null, "wedge cleared without any dragend");
});

test("cancelled drags (dragend, no drop) reset too; safety re-arms per drag", async () => {
  useDragSession.getState().beginDrag("page-1");
  assert.equal(useDragSession.getState().dragKind, "page");
  globalThis.dispatchEvent(new Event("dragend"));
  await tick();
  assert.equal(useDragSession.getState().dragKind, null);
  assert.equal(useDragSession.getState().draggingId, null);
  // A second drag must arm a fresh one-shot safety net.
  useDragSession.getState().beginTabDrag();
  globalThis.dispatchEvent(new Event("drop"));
  await tick();
  assert.equal(useDragSession.getState().dragKind, null);
});

test("the dragged tab is marked a frame after the drag starts, and a leftover frame from an ended drag marks nothing", async () => {
  useDragSession.getState().beginTabDrag("tab-a", 96);
  assert.equal(useDragSession.getState().dragTabId, null, "not on the drag-start frame: the drag image is taken then");
  assert.equal(useDragSession.getState().dragTabWidth, 96);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(useDragSession.getState().dragTabId, "tab-a");
  useDragSession.getState().endDrag();
  assert.equal(useDragSession.getState().dragTabWidth, 0);

  useDragSession.getState().beginTabDrag("tab-old", 80);
  useDragSession.getState().endDrag();
  useDragSession.getState().beginTabDrag("tab-new", 120);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(useDragSession.getState().dragTabId, "tab-new");
  useDragSession.getState().endDrag();
  await tick();
});

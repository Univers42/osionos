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

import { useSidebarTreeDnd } from "../../src/widgets/sidebar/model/sidebarTreeDnd.ts";

// This runner's globalThis is not an EventTarget — give it one so the store's
// window-level safety net is exercisable (the store reads the listener fns at
// CALL time, never at import time). Test files run in their own process, so
// the polyfill leaks nowhere.
const eventTarget = new EventTarget();
if (typeof globalThis.addEventListener !== "function") {
  Object.assign(globalThis, {
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
  });
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test("drag state always resets after a drop, even when the source unmounted", async () => {
  useSidebarTreeDnd.getState().beginTabDrag();
  assert.equal(useSidebarTreeDnd.getState().dragKind, "tab");
  // The browser delivers window-capture `drop` regardless of source unmount.
  globalThis.dispatchEvent(new Event("drop"));
  // Same tick: bubble-phase drop handlers must still see the active drag.
  assert.equal(useSidebarTreeDnd.getState().dragKind, "tab", "reset is deferred past the event cycle");
  await tick();
  assert.equal(useSidebarTreeDnd.getState().dragKind, null, "wedge cleared without any dragend");
});

test("cancelled drags (dragend, no drop) reset too; safety re-arms per drag", async () => {
  useSidebarTreeDnd.getState().beginDrag("page-1");
  assert.equal(useSidebarTreeDnd.getState().dragKind, "page");
  globalThis.dispatchEvent(new Event("dragend"));
  await tick();
  assert.equal(useSidebarTreeDnd.getState().dragKind, null);
  assert.equal(useSidebarTreeDnd.getState().draggingId, null);
  // A second drag must arm a fresh one-shot safety net.
  useSidebarTreeDnd.getState().beginTabDrag();
  globalThis.dispatchEvent(new Event("drop"));
  await tick();
  assert.equal(useSidebarTreeDnd.getState().dragKind, null);
});

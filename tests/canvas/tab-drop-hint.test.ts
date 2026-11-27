// Where a tab or a page dropped on a tab strip lands. The slots are layout boxes (offsetLeft and
// offsetWidth), so the tabs sliding aside during a drag never move the hit areas under the pointer.

import assert from "node:assert/strict";
import test from "node:test";

import { moveTargetIndex, slotEdge, tabDropHint } from "../../src/widgets/workspace-grid/model/tabDropHint.ts";

const slots = [
  { left: 0, width: 100 },
  { left: 104, width: 100 },
  { left: 208, width: 100 },
];
const ids = ["a", "b", "c"];

test("a dragged tab lands before the tab whose midpoint the pointer has not crossed", () => {
  assert.deepEqual(tabDropHint(10, slots, ids, "tab"), { index: 0 });
  assert.deepEqual(tabDropHint(49, slots, ids, "tab"), { index: 0 });
  assert.deepEqual(tabDropHint(51, slots, ids, "tab"), { index: 1 });
  assert.deepEqual(tabDropHint(250, slots, ids, "tab"), { index: 2 });
  assert.deepEqual(tabDropHint(300, slots, ids, "tab"), { index: 3 });
  assert.deepEqual(tabDropHint(900, slots, ids, "tab"), { index: 3 });
});

test("a dragged tab never replaces a tab", () => {
  for (let x = -20; x < 400; x += 7) assert.equal(tabDropHint(x, slots, ids, "tab").replaceTabId, undefined);
});

test("a dragged page inserts in the outer quarters and replaces in the middle half", () => {
  assert.deepEqual(tabDropHint(10, slots, ids, "page"), { index: 0 });
  assert.deepEqual(tabDropHint(50, slots, ids, "page"), { index: 0, replaceTabId: "a" });
  assert.deepEqual(tabDropHint(90, slots, ids, "page"), { index: 1 });
  assert.deepEqual(tabDropHint(102, slots, ids, "page"), { index: 1 });
  assert.deepEqual(tabDropHint(258, slots, ids, "page"), { index: 2, replaceTabId: "c" });
  assert.deepEqual(tabDropHint(500, slots, ids, "page"), { index: 3 });
});

test("a collapsed source tab (width 0) is never a replace target and lands in place", () => {
  const collapsed = [{ left: 0, width: 100 }, { left: 104, width: 0 }, { left: 104, width: 100 }];
  assert.deepEqual(tabDropHint(103, collapsed, ids, "tab"), { index: 1 });
  assert.equal(tabDropHint(154, collapsed, ids, "page").replaceTabId, "c");
  assert.equal(tabDropHint(104, collapsed, ids, "page").replaceTabId, undefined);
});

test("an empty strip lands at 0", () => {
  assert.deepEqual(tabDropHint(40, [], [], "tab"), { index: 0 });
  assert.deepEqual(tabDropHint(40, [], [], "page"), { index: 0 });
});

test("a same-pane move accounts for the tab leaving its old slot", () => {
  assert.equal(moveTargetIndex(0, 0), 0);
  assert.equal(moveTargetIndex(0, 1), 0);
  assert.equal(moveTargetIndex(0, 3), 2);
  assert.equal(moveTargetIndex(2, 0), 0);
  assert.equal(moveTargetIndex(2, 2), 2);
  assert.equal(moveTargetIndex(1, 3), 2);
});

test("slotEdge: the gap starts at the slot's left, or after the last tab, or at 0 on an empty strip", () => {
  const slots = [{ left: 0, width: 100 }, { left: 100, width: 80 }];
  assert.equal(slotEdge(slots, 0), 0);
  assert.equal(slotEdge(slots, 1), 100);
  assert.equal(slotEdge(slots, 2), 180);
  assert.equal(slotEdge([], 0), 0);
});

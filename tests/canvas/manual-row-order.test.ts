/* ************************************************************************** */
/*  manual-row-order.test.ts — record drag-reorder pure helpers               */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildManualRowOrder,
  compareWithManualOrder,
  manualOrderRank,
  rowDropZone,
} from "../../src/shared/notion-database-sys/src/lib/manualRowOrder.ts";

test("manual-row-order: drag down lands after the target", () => {
  assert.deepEqual(buildManualRowOrder(["a", "b", "c"], "a", "c"), ["b", "c", "a"]);
});

test("manual-row-order: drag up lands before the target", () => {
  assert.deepEqual(buildManualRowOrder(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
});

test("manual-row-order: no-op cases return null", () => {
  assert.equal(buildManualRowOrder(["a", "b"], "a", "a"), null);
  assert.equal(buildManualRowOrder(["a", "b"], "x", "a"), null);
  assert.equal(buildManualRowOrder(["a", "b"], "a", "x"), null);
});

test("manual-row-order: ranked pages sort by rank, unranked follow by creation", () => {
  const rank = manualOrderRank(["c", "a"]);
  const pages = [
    { id: "a", createdAt: "2026-01-01" },
    { id: "b", createdAt: "2026-01-02" },
    { id: "c", createdAt: "2026-01-03" },
    { id: "d", createdAt: "2026-01-00" },
  ];
  const sorted = [...pages].sort((x, y) => compareWithManualOrder(x, y, rank));
  assert.deepEqual(sorted.map((p) => p.id), ["c", "a", "d", "b"]);
});

test("manual-row-order: empty order behaves as creation order", () => {
  assert.equal(manualOrderRank(undefined), null);
  assert.equal(manualOrderRank([]), null);
  const pages = [{ id: "b", createdAt: "2" }, { id: "a", createdAt: "1" }];
  const sorted = [...pages].sort((x, y) => compareWithManualOrder(x, y, null));
  assert.deepEqual(sorted.map((p) => p.id), ["a", "b"]);
});

test("manual-row-order: a row drop is an edge in the outer quarters and nests in the middle", () => {
  const both = { edges: true, nest: true };
  assert.equal(rowDropZone(2, 40, both), "before");
  assert.equal(rowDropZone(20, 40, both), "nest");
  assert.equal(rowDropZone(38, 40, both), "after");
  assert.equal(rowDropZone(2, 40, { edges: false, nest: true }), "nest", "no edges: the whole row nests");
  assert.equal(rowDropZone(20, 40, { edges: true, nest: false }), "slot", "no nesting: today's take-the-slot reorder");
  assert.equal(rowDropZone(20, 40, { edges: false, nest: false }), null, "nothing to do: not a drop target");
});

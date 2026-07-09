/* ************************************************************************** */
/*  manual-row-order.test.ts — record drag-reorder pure helpers               */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildManualRowOrder,
  compareWithManualOrder,
  manualOrderRank,
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

/* ************************************************************************** */
/*  view-pager-math.test.ts — record pagination windowing (the Limit setting) */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  resolvePageSize,
  computePageWindow,
} from "../../src/shared/notion-database-sys/src/hooks/viewPagerMath.ts";

test("resolvePageSize: 0 = All (Infinity), unset = default 50, else the value", () => {
  assert.equal(resolvePageSize(0), Infinity);
  assert.equal(resolvePageSize(undefined), 50);
  assert.equal(resolvePageSize(25), 25);
  assert.equal(resolvePageSize(100), 100);
  // Guard against negatives/garbage falling through to a weird window.
  assert.equal(resolvePageSize(-5), 50);
});

test("computePageWindow: first page of 200 rows, size 25", () => {
  const w = computePageWindow(200, 25, 0);
  assert.deepEqual(
    { start: w.start, end: w.end, pageCount: w.pageCount, hasPrev: w.hasPrev, hasNext: w.hasNext, enabled: w.enabled },
    { start: 0, end: 25, pageCount: 8, hasPrev: false, hasNext: true, enabled: true },
  );
});

test("computePageWindow: a middle page shows the right slice", () => {
  const w = computePageWindow(200, 25, 1);
  assert.equal(w.start, 25);
  assert.equal(w.end, 50);
  assert.ok(w.hasPrev && w.hasNext);
});

test("computePageWindow: last (partial) page clamps end to total", () => {
  const w = computePageWindow(26, 25, 1); // 26 rows, page 2 → just 1 row
  assert.equal(w.start, 25);
  assert.equal(w.end, 26);
  assert.equal(w.hasNext, false);
  assert.equal(w.pageCount, 2);
});

test("computePageWindow: pageIndex past the end clamps to the last page", () => {
  const w = computePageWindow(26, 25, 99);
  assert.equal(w.pageIndex, 1);
  assert.equal(w.start, 25);
  assert.equal(w.end, 26);
});

test("computePageWindow: limit >= total → single page, pager disabled", () => {
  const w = computePageWindow(10, 25, 0);
  assert.equal(w.enabled, false);
  assert.equal(w.hasNext, false);
  assert.equal(w.pageCount, 1);
});

test("computePageWindow: All (Infinity) shows everything, disabled", () => {
  const w = computePageWindow(500, Infinity, 3);
  assert.equal(w.start, 0);
  assert.equal(w.end, 500);
  assert.equal(w.pageCount, 1);
  assert.equal(w.enabled, false);
});

test("computePageWindow: empty list stays on a valid single page", () => {
  const w = computePageWindow(0, 25, 0);
  assert.equal(w.start, 0);
  assert.equal(w.end, 0);
  assert.equal(w.pageCount, 1);
  assert.equal(w.enabled, false);
});

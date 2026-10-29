/* ************************************************************************** */
/*  view-pager-math.test.ts — record pagination windowing (the Limit setting) */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  resolvePageSize,
  computePageWindow,
  computeViewWindow,
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

test("computeViewWindow: load more appends in place, paging then steps by the window", () => {
  const one = computeViewWindow(340, 50, 1, 0);
  assert.deepEqual([one.start, one.end, one.pageCount], [0, 50, 7]);
  const two = computeViewWindow(340, 50, 2, 0);
  assert.deepEqual([two.start, two.end, two.pageCount, two.pageIndex], [0, 100, 4, 0], "rows 1-100 shown, 4 pages left");
  const next = computeViewWindow(340, 50, 2, 100);
  assert.deepEqual([next.start, next.end, next.pageIndex, next.hasPrev, next.hasNext], [100, 200, 1, true, true]);
  const last = computeViewWindow(340, 50, 2, 300);
  assert.deepEqual([last.start, last.end, last.hasNext], [300, 340, false]);
});

test("computeViewWindow: grown from a middle page keeps its first row", () => {
  const w = computeViewWindow(340, 50, 2, 50);
  assert.deepEqual([w.start, w.end, w.pageIndex], [50, 150, 1]);
});

test("computeViewWindow: show all overrides a finite limit but stays enabled", () => {
  const w = computeViewWindow(340, 50, Infinity, 150);
  assert.deepEqual([w.start, w.end, w.pageCount, w.hasNext, w.enabled], [0, 340, 1, false, true]);
  assert.equal(computeViewWindow(340, Infinity, 1, 0).enabled, false, "the All limit hides nothing");
});

test("computeViewWindow: start past a shrunk list clamps onto the last rows", () => {
  const w = computeViewWindow(30, 25, 1, 200);
  assert.deepEqual([w.start, w.end], [25, 30]);
  assert.deepEqual([computeViewWindow(0, 25, 3, 75).start, computeViewWindow(0, 25, 3, 75).end], [0, 0]);
});

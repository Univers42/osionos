/* chart-layout.test.ts — label-fit orientation, axis width, donut legend side */

import assert from "node:assert/strict";
import test from "node:test";

import {
  categoryAxisWidth, donutLegendOnSide, sharePercent, prefersHorizontalBars,
} from "../../src/shared/notion-database-sys/src/components/views/chart/chartLayout.ts";

test("long labels in a narrow plot flip vertical bars to horizontal", () => {
  const labels = ["Accepted", "Rejected", "Pending review", "Archived", "Draft"];
  assert.equal(prefersHorizontalBars(labels, 300, false), true);
  assert.equal(prefersHorizontalBars(["A", "B", "C"], 300, false), false);
  assert.equal(prefersHorizontalBars(["A", "B"], 300, true), true);
  assert.equal(prefersHorizontalBars(labels, 0, false), false);
});

test("axis width fits the longest label within bounds", () => {
  assert.equal(categoryAxisWidth(["ab"], 500), 72);
  assert.equal(categoryAxisWidth(["x".repeat(100)], 500), 200);
  assert.equal(categoryAxisWidth(["x".repeat(20)], 500), 142);
});

test("side legend only when the widget is wide and wider than tall", () => {
  assert.equal(donutLegendOnSide(500, 260), true);
  assert.equal(donutLegendOnSide(300, 120), false);
  assert.equal(donutLegendOnSide(500, 450), false);
});

test("share percent rounds and flags slivers", () => {
  assert.equal(sharePercent(1, 3), "33%");
  assert.equal(sharePercent(1, 1000), "<1%");
  assert.equal(sharePercent(0, 10), "0%");
  assert.equal(sharePercent(5, 0), "0%");
});

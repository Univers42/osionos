/* ************************************************************************** */
/*  dashboard-layout.test.ts — pure layout mutations for the dashboard view  */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  addWidget, removeWidget, duplicateWidget, normalizeRow,
  MAX_WIDGETS, MAX_PER_ROW, EMPTY_LAYOUT,
} from "../../src/shared/notion-database-sys/src/components/views/dashboard/notion/model/dashboardLayout.ts";
import type { DashboardLayout } from "../../src/shared/notion-database-sys/src/components/views/dashboard/notion/model/dashboardLayout.ts";
import {
  moveWidget, resizeWidths, resizeRowHeight,
} from "../../src/shared/notion-database-sys/src/components/views/dashboard/notion/model/dashboardLayoutMove.ts";

function build(...rowSpecs: string[][]): DashboardLayout {
  const widgets = rowSpecs.flat().map(id => ({ id, viewId: `view-${id}` }));
  const rows = rowSpecs.map((ids, i) => normalizeRow({
    id: `row${i}`, widgetIds: ids, widths: ids.map(() => 0), height: 320,
  }));
  return { rows, widgets };
}

test("dashboard-layout: addWidget fills the last row then opens a new one", () => {
  let layout: DashboardLayout | null = EMPTY_LAYOUT;
  for (let i = 0; i < 5; i++) layout = addWidget(layout!, `view-${i}`, `w${i}`);
  assert.ok(layout);
  assert.equal(layout.rows.length, 2);
  assert.equal(layout.rows[0].widgetIds.length, MAX_PER_ROW);
  assert.deepEqual(layout.rows[1].widgetIds, ["w4"]);
  // widths re-normalized: 4 × 0.25 then [1]
  assert.deepEqual(layout.rows[0].widths, [0.25, 0.25, 0.25, 0.25]);
  assert.deepEqual(layout.rows[1].widths, [1]);
});

test("dashboard-layout: 12-widget cap rejects the 13th", () => {
  let layout: DashboardLayout | null = EMPTY_LAYOUT;
  for (let i = 0; i < MAX_WIDGETS; i++) layout = addWidget(layout!, `view-${i}`, `w${i}`);
  assert.ok(layout);
  assert.equal(layout.widgets.length, MAX_WIDGETS);
  assert.equal(addWidget(layout, "view-extra"), null);
});

test("dashboard-layout: removeWidget renormalizes and drops empty rows", () => {
  const layout = build(["a", "b"], ["c"]);
  const next = removeWidget(layout, "c");
  assert.equal(next.rows.length, 1);
  assert.equal(next.widgets.length, 2);
  const next2 = removeWidget(next, "a");
  assert.deepEqual(next2.rows[0].widths, [1]);
});

test("dashboard-layout: duplicate lands beside the source, new row when full", () => {
  const layout = build(["a", "b"]);
  const next = duplicateWidget(layout, "a", "view-copy", "a2");
  assert.ok(next);
  assert.deepEqual(next.rows[0].widgetIds, ["a", "a2", "b"]);
  assert.equal(next.widgets.find(w => w.id === "a2")?.viewId, "view-copy");

  const full = build(["a", "b", "c", "d"]);
  const overflow = duplicateWidget(full, "b", "view-copy", "b2");
  assert.ok(overflow);
  assert.equal(overflow.rows.length, 2);
  assert.deepEqual(overflow.rows[1].widgetIds, ["b2"]);
});

test("dashboard-layout: moveWidget across rows respects the 4-per-row cap", () => {
  const layout = build(["a", "b"], ["c", "d", "e", "f"]);
  // target row full → unchanged
  const rejected = moveWidget(layout, "a", { rowId: "row1", index: 0 });
  assert.deepEqual(rejected.rows[0].widgetIds, ["a", "b"]);
  // move within row
  const swapped = moveWidget(layout, "a", { rowId: "row0", index: 2 });
  assert.deepEqual(swapped.rows[0].widgetIds, ["b", "a"]);
  // move to a fresh row below
  const newRow = moveWidget(layout, "a", { rowId: "row0", index: 0, newRowAfter: true });
  assert.equal(newRow.rows.length, 3);
  assert.deepEqual(newRow.rows[1].widgetIds, ["a"]);
  assert.deepEqual(newRow.rows[0].widgetIds, ["b"]);
  assert.deepEqual(newRow.rows[0].widths, [1]); // renormalized
});

test("dashboard-layout: resizeWidths clamps both sides to the 1/8 minimum", () => {
  const layout = build(["a", "b"]);
  const next = resizeWidths(layout, "row0", 0, 0.2);
  assert.ok(Math.abs(next.rows[0].widths[0] - 0.7) < 1e-9);
  assert.ok(Math.abs(next.rows[0].widths[1] - 0.3) < 1e-9);
  const clamped = resizeWidths(layout, "row0", 0, 0.9);
  assert.ok(Math.abs(clamped.rows[0].widths[1] - 1 / 8) < 1e-9);
  assert.ok(Math.abs(clamped.rows[0].widths[0] + clamped.rows[0].widths[1] - 1) < 1e-9);
});

test("dashboard-layout: row height clamps to sane bounds", () => {
  const layout = build(["a"]);
  assert.equal(resizeRowHeight(layout, "row0", 99999).rows[0].height, 800);
  assert.equal(resizeRowHeight(layout, "row0", 10).rows[0].height, 160);
  assert.equal(resizeRowHeight(layout, "row0", 444.4).rows[0].height, 444);
});

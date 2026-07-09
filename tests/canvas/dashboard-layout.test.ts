/* ************************************************************************** */
/*  dashboard-layout.test.ts — pure layout mutations for the dashboard view  */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  addWidget, removeWidget, duplicateWidget, normalizeRow, rowStacks, stackShares,
  MAX_WIDGETS, MAX_PER_ROW, MIN_STACK_SHARE, EMPTY_LAYOUT,
} from "../../src/shared/notion-database-sys/src/components/views/dashboard/notion/model/dashboardLayout.ts";
import type { DashboardLayout } from "../../src/shared/notion-database-sys/src/components/views/dashboard/notion/model/dashboardLayout.ts";
import {
  moveWidget, resizeWidths, resizeRowHeight, resizeWidgetHeight,
  resizeStackShares, resizeStackHeight, resizeLastWidth,
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

test("dashboard-layout: addWidget targets a row, spills after it when full", () => {
  const layout = build(["a", "b"], ["c", "d", "e", "f"]);
  const intoRow = addWidget(layout, "view-x", "x", { targetRowId: "row0" });
  assert.ok(intoRow);
  assert.deepEqual(intoRow.rows[0].widgetIds, ["a", "b", "x"]);
  const spilled = addWidget(layout, "view-y", "y", { targetRowId: "row1" });
  assert.ok(spilled);
  assert.equal(spilled.rows.length, 3);
  assert.deepEqual(spilled.rows[2].widgetIds, ["y"], "full target row spills to a new row after it");
  assert.equal(spilled.rows[2].height, layout.rows[1].height, "spilled row inherits the target's height");
});

test("dashboard-layout: forceNewRow always opens a fresh bottom row", () => {
  const layout = build(["a"]);
  const next = addWidget(layout, "view-x", "x", { forceNewRow: true });
  assert.ok(next);
  assert.equal(next.rows.length, 2);
  assert.deepEqual(next.rows[1].widgetIds, ["x"]);
});

test("dashboard-layout: stat option rides on the widget", () => {
  const layout = build(["a"]);
  const next = addWidget(layout, "view-x", "x", { stat: { fn: "sum", propertyId: "p1" } });
  assert.ok(next);
  assert.deepEqual(next.widgets.find(w => w.id === "x")?.stat, { fn: "sum", propertyId: "p1" });
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

test("dashboard-layout: moveWidget keeps custom widths on untouched rows", () => {
  const layout = build(["a", "b"], ["c", "d"], ["e"]);
  // The user resized row0; moving a widget between row1 and row2 must not reshape it.
  layout.rows[0] = { ...layout.rows[0], widths: [0.7, 0.3] };
  const next = moveWidget(layout, "e", { rowId: "row1", index: 0 });
  assert.deepEqual(next.rows[0].widths, [0.7, 0.3], "untouched row keeps dragged widths");
  assert.deepEqual(next.rows[1].widths, [1 / 3, 1 / 3, 1 / 3], "target row re-equalized");
  assert.equal(next.rows.length, 2, "emptied source row dropped");
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

test("dashboard-layout: resizeWidgetHeight detaches one card, clamped", () => {
  const layout = build(["a", "b"]);
  const next = resizeWidgetHeight(layout, "a", 480.6);
  assert.equal(next.widgets.find(w => w.id === "a")?.height, 481);
  assert.equal(next.widgets.find(w => w.id === "b")?.height, undefined, "sibling stays aligned");
  assert.equal(next.rows[0].height, 320, "row height untouched");
  assert.equal(resizeWidgetHeight(layout, "a", 99999).widgets[0].height, 800);
  assert.equal(resizeWidgetHeight(layout, "a", 10).widgets[0].height, 160);
});

test("dashboard-layout: resizeWidgetHeight(null) re-aligns the card", () => {
  const layout = resizeWidgetHeight(build(["a", "b"]), "a", 500);
  const realigned = resizeWidgetHeight(layout, "a", null);
  assert.ok(!("height" in realigned.widgets.find(w => w.id === "a")!), "override key removed");
});

test("dashboard-layout: resizeWidgetHeight on unknown widget is identity", () => {
  const layout = build(["a"]);
  assert.equal(resizeWidgetHeight(layout, "ghost", 500), layout);
});

test("dashboard-layout: a detached card keeps its height through moves and duplicates", () => {
  const layout = resizeWidgetHeight(build(["a", "b"], ["c"]), "a", 500);
  const moved = moveWidget(layout, "a", { rowId: "row1", index: 1 });
  assert.equal(moved.widgets.find(w => w.id === "a")?.height, 500, "move keeps the card's own height");
  const dup = duplicateWidget(layout, "a", "view-a2", "a2");
  assert.equal(dup?.widgets.find(w => w.id === "a2")?.height, 500, "duplicate copies it");
});

test("dashboard-stacks: legacy rows derive one single-card column per widget", () => {
  const layout = build(["a", "b"]);
  assert.deepEqual(rowStacks(layout.rows[0]).map(s => s.widgetIds), [["a"], ["b"]]);
});

test("dashboard-stacks: moving into a stack keeps flat widgetIds and widths in sync", () => {
  const layout = build(["a", "b"], ["c"]);
  const next = moveWidget(layout, "c", { rowId: "row0", index: 0, intoStack: { col: 0, at: 1 } });
  assert.deepEqual(rowStacks(next.rows[0]).map(s => s.widgetIds), [["a", "c"], ["b"]]);
  assert.deepEqual(next.rows[0].widgetIds, ["a", "c", "b"], "flat list re-flattened");
  assert.deepEqual(next.rows[0].widths, [0.5, 0.5], "column count unchanged, widths kept");
  assert.equal(next.rows.length, 1, "emptied source row dropped");
});

test("dashboard-stacks: a dropped card fills the HOLE a shrunk card left", () => {
  // Row 400px tall; "a" was detached to 160px → hole of 0.6 below it.
  let layout = build(["a", "b"]);
  layout = { ...layout, rows: [{ ...layout.rows[0], height: 400 }] };
  layout = resizeWidgetHeight(layout, "a", 160);
  const next = moveWidget(layout, "b", { rowId: "row0", index: 0, intoStack: { col: 0, at: 1 } });
  const shares = stackShares(rowStacks(next.rows[0])[0]);
  assert.ok(Math.abs(shares[0] - 0.4) < 1e-9, `kept card keeps its fraction (got ${shares[0]})`);
  assert.ok(Math.abs(shares[1] - 0.6) < 1e-9, `incoming card takes the hole (got ${shares[1]})`);
  assert.equal(next.widgets.find(w => w.id === "b")?.height, undefined, "mover sheds its override");
});

test("dashboard-stacks: stack depth caps at 3", () => {
  const layout = build(["a", "b", "c", "d"], ["e"]);
  let next = moveWidget(layout, "b", { rowId: "row0", index: 0, intoStack: { col: 0, at: 1 } });
  next = moveWidget(next, "c", { rowId: "row0", index: 0, intoStack: { col: 0, at: 2 } });
  assert.equal(rowStacks(next.rows[0])[0].widgetIds.length, 3);
  const capped = moveWidget(next, "e", { rowId: "row0", index: 0, intoStack: { col: 0, at: 3 } });
  assert.equal(capped, next, "4th member rejected");
});

test("dashboard-stacks: resizeStackShares moves the pair, clamped to the min share", () => {
  const layout = build(["a", "b"], ["c"]);
  const stacked = moveWidget(layout, "c", { rowId: "row0", index: 0, intoStack: { col: 0, at: 1 } });
  const next = resizeStackShares(stacked, "row0", 0, 0, 0.2);
  const shares = stackShares(rowStacks(next.rows[0])[0]);
  assert.ok(Math.abs(shares[0] - 0.7) < 1e-9 && Math.abs(shares[1] - 0.3) < 1e-9, `got ${shares}`);
  const clamped = resizeStackShares(stacked, "row0", 0, 0, 0.9);
  const s2 = stackShares(rowStacks(clamped.rows[0])[0]);
  assert.ok(Math.abs(s2[1] - MIN_STACK_SHARE) < 1e-9, "bottom clamped to min share");
});

test("dashboard-stacks: removing a member renormalizes and restores legacy shape", () => {
  const layout = build(["a", "b"], ["c"]);
  const stacked = moveWidget(layout, "c", { rowId: "row0", index: 0, intoStack: { col: 0, at: 1 } });
  const reshared = resizeStackShares(stacked, "row0", 0, 0, 0.2); // [0.7, 0.3]
  const next = removeWidget(reshared, "a");
  assert.deepEqual(next.rows[0].widgetIds, ["c", "b"]);
  assert.equal(next.rows[0].stacks, undefined, "all-singleton row back to legacy shape");
});

test("dashboard-stacks: moving a member OUT restores the survivor to a plain column", () => {
  const layout = build(["a", "b"], ["c"]);
  const stacked = moveWidget(layout, "c", { rowId: "row0", index: 0, intoStack: { col: 0, at: 1 } });
  const next = moveWidget(stacked, "c", { rowId: "row0", index: 2 });
  assert.equal(next.rows[0].stacks, undefined);
  assert.deepEqual(next.rows[0].widgetIds, ["a", "b", "c"]);
  assert.deepEqual(next.rows[0].widths.length, 3, "widths re-equalized for 3 columns");
});

test("dashboard-stacks: stacked members ignore px height overrides", () => {
  const layout = build(["a", "b"], ["c"]);
  const stacked = moveWidget(layout, "c", { rowId: "row0", index: 0, intoStack: { col: 0, at: 1 } });
  assert.equal(resizeWidgetHeight(stacked, "a", 500), stacked, "no-op for stack members");
});

test("dashboard-slack: shrinking a solo card from its right edge leaves trailing slack", () => {
  const layout = build(["a"]);
  const next = resizeLastWidth(layout, "row0", -0.4);
  assert.ok(Math.abs(next.rows[0].widths[0] - 0.6) < 1e-9, `got ${next.rows[0].widths}`);
  const clamped = resizeLastWidth(layout, "row0", -0.95);
  assert.ok(Math.abs(clamped.rows[0].widths[0] - 1 / 8) < 1e-9, "clamps at the min width");
});

test("dashboard-slack: growing back within the snap threshold restores full width", () => {
  const shrunk = resizeLastWidth(build(["a"]), "row0", -0.4);
  const snapped = resizeLastWidth(shrunk, "row0", 0.38);
  assert.equal(snapped.rows[0].widths[0], 1, "0.98 snaps to 1");
});

test("dashboard-slack: only the LAST column resizes; siblings keep their widths", () => {
  const layout = build(["a", "b"]);
  const next = resizeLastWidth(layout, "row0", -0.2);
  assert.ok(Math.abs(next.rows[0].widths[0] - 0.5) < 1e-9, "first column untouched");
  assert.ok(Math.abs(next.rows[0].widths[1] - 0.3) < 1e-9, `got ${next.rows[0].widths}`);
});

test("dashboard-stack-height: a stack detaches with its own clamped height, null re-aligns", () => {
  const layout = build(["a", "b"], ["c"]);
  const stacked = moveWidget(layout, "c", { rowId: "row0", index: 0, intoStack: { col: 0, at: 1 } });
  const next = resizeStackHeight(stacked, "row0", 0, 480.4);
  assert.equal(rowStacks(next.rows[0])[0].height, 480);
  assert.equal(rowStacks(next.rows[0])[1].height, undefined, "sibling column untouched");
  assert.equal(next.rows[0].height, 320, "row height untouched");
  const realigned = resizeStackHeight(next, "row0", 0, null);
  assert.equal(rowStacks(realigned.rows[0])[0].height, undefined);
  assert.equal(resizeStackHeight(layout, "row0", 1, 400), layout, "no-op for single-card columns");
});

test("dashboard-stack-height: survives unrelated ops, dies with the stack", () => {
  const layout = build(["a", "b"], ["c", "d"]);
  let next = moveWidget(layout, "c", { rowId: "row0", index: 0, intoStack: { col: 0, at: 1 } });
  next = resizeStackHeight(next, "row0", 0, 500);
  const resized = resizeStackShares(next, "row0", 0, 0, 0.1);
  assert.equal(rowStacks(resized.rows[0])[0].height, 500, "share resize keeps the column height");
  const dissolved = removeWidget(resized, "c");
  assert.equal(dissolved.rows[0].stacks, undefined, "singleton column back to legacy shape");
});

test("dashboard-stack-height: dropping into the hole below a SHORT stack fills and re-aligns it", () => {
  // Row 400px; stack [a,c] detached to 200px → hole of 0.5 below the stack.
  let layout = build(["a", "b"], ["c"]);
  layout = { ...layout, rows: layout.rows.map(r => (r.id === "row0" ? { ...r, height: 400 } : r)) };
  layout = moveWidget(layout, "c", { rowId: "row0", index: 0, intoStack: { col: 0, at: 1 } });
  layout = resizeStackHeight(layout, "row0", 0, 200);
  const next = moveWidget(layout, "b", { rowId: "row0", index: 0, intoStack: { col: 0, at: 2 } });
  const stack = rowStacks(next.rows[0])[0];
  assert.deepEqual(stack.widgetIds, ["a", "c", "b"]);
  assert.equal(stack.height, undefined, "hole consumed → column re-aligned");
  const shares = stackShares(stack);
  assert.ok(Math.abs(shares[2] - 0.5) < 1e-9, `incoming takes the hole (got ${shares})`);
  assert.ok(Math.abs(shares[0] - 0.25) < 1e-9, "existing members keep their visual extent");
});

/* ************************************************************************** */
/*  dashboard-drag-target.test.ts — pure DnD hit-testing for the dashboard   */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  hitTestDropTarget, type RowGeometry,
} from "../../src/shared/notion-database-sys/src/components/views/dashboard/notion/model/dashboardDragTarget.ts";

function row(rowId: string, top: number, slots: number, opts: Partial<RowGeometry> = {}): RowGeometry {
  const width = 400 / Math.max(1, slots);
  return {
    rowId, top, bottom: top + 100, left: 0, right: 400,
    slots: Array.from({ length: slots }, (_, i) => ({ left: i * width, right: (i + 1) * width })),
    containsSource: false,
    ...opts,
  };
}

test("drag-target: a card's left/right edge zones insert a column beside it", () => {
  const rows = [row("r1", 0, 2)];
  assert.deepEqual(hitTestDropTarget(rows, 20, 50).target, { rowId: "r1", index: 0 });
  assert.deepEqual(hitTestDropTarget(rows, 180, 50).target, { rowId: "r1", index: 1 });
  assert.deepEqual(hitTestDropTarget(rows, 390, 50).target, { rowId: "r1", index: 2 });
  const between = hitTestDropTarget(rows, 180, 50).indicator;
  assert.equal(between?.kind, "slot");
  assert.equal(between?.kind === "slot" && between.x, 200, "bar sits on the shared edge");
});

test("drag-target: mid-card of a wide chart snaps to its nearest edge, never the row's far left", () => {
  // Live Scoreboard repro: full-width chart 769..1445 x 643..983, pointer x=1100.
  const rows: RowGeometry[] = [{
    rowId: "r1", top: 643, bottom: 983, left: 769, right: 1445, containsSource: false,
    slots: [{ left: 769, right: 1445, cards: [{ top: 643, bottom: 983 }] }],
  }];
  for (let y = 650; y <= 980; y += 10) {
    const { indicator } = hitTestDropTarget(rows, 1100, y);
    assert.ok(indicator, `y=${y} resolves`);
    assert.notEqual(indicator.kind === "slot" && indicator.x, 769, `y=${y} must not jump to the left edge`);
    const expected = y < 813 ? 643 : 983;
    assert.equal(indicator.kind === "stack" && indicator.y, expected, `y=${y} bar on the nearest edge`);
  }
  assert.equal(hitTestDropTarget(rows, 790, 813).indicator?.kind, "slot", "near the left edge inserts a column");
});

test("drag-target: full row blocks foreign widgets but keeps the refused bar", () => {
  const full = [row("r1", 0, 4)];
  const resolution = hitTestDropTarget(full, 95, 50);
  assert.equal(resolution.target, null);
  assert.equal(resolution.blocked, true);
  assert.equal(resolution.indicator?.kind, "slot", "blocked drops stay visible");
  const own = [row("r1", 0, 4, { containsSource: true })];
  assert.ok(hitTestDropTarget(own, 95, 50).target, "reorder within own full row allowed");
});

test("drag-target: gutters create a new row after the row above", () => {
  const rows = [row("r1", 0, 1), row("r2", 120, 1)];
  const between = hitTestDropTarget(rows, 200, 110);
  assert.deepEqual(between.target, { rowId: "r1", index: 0, newRowAfter: true });
  assert.equal(between.indicator?.kind, "row");
  const below = hitTestDropTarget(rows, 200, 400);
  assert.deepEqual(below.target, { rowId: "r2", index: 0, newRowAfter: true });
});

test("drag-target: outside any row/gutter resolves to nothing", () => {
  const rows = [row("r1", 100, 2)];
  assert.equal(hitTestDropTarget(rows, 200, 10).target, null, "above the first row");
  assert.equal(hitTestDropTarget(rows, 500, 150).target, null, "right of the row");
  assert.equal(hitTestDropTarget([], 0, 0).target, null);
});

test("drag-target: card bottom band and the hole below a short card stack into the column", () => {
  const short = [row("r1", 0, 2, {
    slots: [
      { left: 0, right: 200, cards: [{ top: 0, bottom: 40 }] },   // shrunk card, hole 40..100
      { left: 200, right: 400, cards: [{ top: 0, bottom: 100 }] },
    ],
  })];
  const hole = hitTestDropTarget(short, 100, 70);
  assert.deepEqual(hole.target, { rowId: "r1", index: 0, intoStack: { col: 0, at: 1 } }, "hole appends");
  assert.equal(hole.indicator?.kind, "stack");
  const bottomBand = hitTestDropTarget(short, 300, 95);
  assert.deepEqual(bottomBand.target?.intoStack, { col: 1, at: 1 }, "full-height card bottom band stacks below");
  const topBand = hitTestDropTarget(short, 300, 10);
  assert.deepEqual(topBand.target?.intoStack, { col: 1, at: 0 }, "top band stacks above");
});

test("drag-target: full stacks block their edges, side edges still insert columns", () => {
  const rows = [row("r1", 0, 2, {
    slots: [
      { left: 0, right: 200, cards: [{ top: 0, bottom: 33 }, { top: 39, bottom: 66 }, { top: 72, bottom: 100 }] },
      { left: 200, right: 400, cards: [{ top: 0, bottom: 100 }] },
    ],
  })];
  const band = hitTestDropTarget(rows, 100, 3);
  assert.equal(band.target, null);
  assert.equal(band.blocked, true, "3-deep stack rejects a 4th");
  assert.equal(band.indicator?.kind, "stack");
  const gap = hitTestDropTarget(rows, 100, 36);
  assert.equal(gap.blocked, true, "gap between stacked cards is a stack slot too");
  assert.equal(gap.indicator?.kind === "stack" && gap.indicator.y, 36, "bar centred in the gap");
  const side = hitTestDropTarget(rows, 380, 50);
  assert.deepEqual(side.target, { rowId: "r1", index: 2 }, "right edge appends a column");
});

test("drag-target: trailing slack after the last column is a column-insert target", () => {
  // Solo column shrunk to 60% width: x beyond its right edge = the slack.
  const rows = [row("r1", 0, 1, {
    slots: [{ left: 0, right: 240, cards: [{ top: 0, bottom: 100 }] }],
  })];
  const slack = hitTestDropTarget(rows, 320, 50);
  assert.deepEqual(slack.target, { rowId: "r1", index: 1 }, "drop into the slack appends a column");
  assert.equal(slack.indicator?.kind, "slot");
});

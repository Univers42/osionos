/* ************************************************************************** */
/*  calendar-time-grid.test.ts — pure hour-grid math for the week/day views  */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  minutesOfDay, snapToSlot, minutesToOffsetPx, offsetPxToMinutes,
  packTimedColumns, nowLineMinutes, withMinutesOfDay,
} from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarTimeGrid.ts";
import type { TimedItem, TimedPlacement } from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarTimeGrid.ts";

const item = (id: string, startMin: number, endMin: number): TimedItem => ({ id, startMin, endMin });
const byId = (placements: TimedPlacement[]): Map<string, TimedPlacement> =>
  new Map(placements.map(p => [p.id, p]));

test("time-grid: minutesOfDay reads LOCAL hours off the ISO's own day", () => {
  const iso = new Date(2026, 6, 7, 9, 30).toISOString();
  assert.equal(minutesOfDay(iso), 570, "9:30 local → 570");
  assert.equal(minutesOfDay(new Date(2026, 6, 7, 0, 0).toISOString()), 0, "local midnight → 0");
  assert.equal(minutesOfDay(new Date(2026, 6, 7, 23, 59).toISOString()), 1439, "local 23:59 → 1439");
});

test("time-grid: snapToSlot rounds to the nearest 30-minute slot", () => {
  assert.equal(snapToSlot(44), 30, "44 rounds down to 30");
  assert.equal(snapToSlot(46), 60, "46 rounds up to 60");
  assert.equal(snapToSlot(45), 60, "half-slot rounds up");
  assert.equal(snapToSlot(0), 0);
  assert.equal(snapToSlot(570), 570, "already aligned stays put");
});

test("time-grid: snapToSlot clamps to the day and honors a custom slot", () => {
  assert.equal(snapToSlot(-10), 0, "below midnight clamps to 0");
  assert.equal(snapToSlot(-100), 0, "well below midnight clamps to 0");
  assert.equal(snapToSlot(1500), 1440, "past end of day clamps to 1440");
  assert.equal(snapToSlot(44, 15), 45, "custom 15-min slot: 44 → 45");
  assert.equal(snapToSlot(7, 15), 0, "custom 15-min slot: 7 → 0");
  assert.equal(snapToSlot(1439, 15), 1440, "custom slot still clamped to the day");
});

test("time-grid: minutesToOffsetPx/offsetPxToMinutes roundtrip at hourHeight 48", () => {
  const h = 48;
  assert.equal(minutesToOffsetPx(570, h), 456, "9:30 → 456px");
  assert.equal(offsetPxToMinutes(456, h), 570, "456px → back to 570 (slot-aligned)");
  assert.equal(minutesToOffsetPx(0, h), 0);
  assert.equal(offsetPxToMinutes(0, h), 0);
  assert.equal(offsetPxToMinutes(minutesToOffsetPx(1440, h), h), 1440, "end of day roundtrips");
  // Non-aligned minutes come back SNAPPED, not exact.
  assert.equal(offsetPxToMinutes(minutesToOffsetPx(44, h), h), 30, "44 → px → snapped 30");
  assert.equal(offsetPxToMinutes(minutesToOffsetPx(46, h), h), 60, "46 → px → snapped 60");
  assert.equal(offsetPxToMinutes(minutesToOffsetPx(44, h), h, 15), 45, "custom slot on the way back");
});

test("time-grid: packTimedColumns returns [] for no items", () => {
  assert.deepEqual(packTimedColumns([]), []);
});

test("time-grid: two disjoint events each get the full width", () => {
  const placed = byId(packTimedColumns([item("a", 0, 60), item("b", 60, 120)]));
  assert.deepEqual(placed.get("a"), { id: "a", col: 0, cols: 1 }, "endMin is exclusive — touching ≠ overlap");
  assert.deepEqual(placed.get("b"), { id: "b", col: 0, cols: 1 });
});

test("time-grid: two overlapping events split into two distinct columns", () => {
  const placed = byId(packTimedColumns([item("a", 0, 60), item("b", 30, 90)]));
  assert.equal(placed.get("a")!.cols, 2);
  assert.equal(placed.get("b")!.cols, 2);
  assert.deepEqual([placed.get("a")!.col, placed.get("b")!.col].sort(), [0, 1], "distinct cols 0/1");
});

test("time-grid: chain A-B-C forms ONE transitive cluster, C reuses col 0", () => {
  // A(0-60) ∩ B(30-90); C(70-120) ∩ B but NOT A → still one cluster via sweep
  // (cluster end extends to the max end seen), C first-fits back into col 0.
  const placed = byId(packTimedColumns([item("A", 0, 60), item("B", 30, 90), item("C", 70, 120)]));
  assert.deepEqual(placed.get("A"), { id: "A", col: 0, cols: 2 });
  assert.deepEqual(placed.get("B"), { id: "B", col: 1, cols: 2 });
  assert.deepEqual(placed.get("C"), { id: "C", col: 0, cols: 2 }, "C overlaps only B → back to col 0");
});

test("time-grid: a gap after the cluster starts a fresh full-width cluster", () => {
  const placed = byId(packTimedColumns([
    item("A", 0, 60), item("B", 30, 90), item("C", 70, 120), item("D", 200, 260),
  ]));
  assert.equal(placed.get("A")!.cols, 2, "first cluster unchanged");
  assert.deepEqual(placed.get("D"), { id: "D", col: 0, cols: 1 }, "post-gap event is its own cluster");
});

test("time-grid: packTimedColumns is deterministic under input order shuffle", () => {
  const events = [
    item("A", 0, 60), item("B", 30, 90), item("C", 70, 120),
    item("D", 200, 260), item("E", 30, 45),
  ];
  const canonical = packTimedColumns(events).sort((a, b) => a.id.localeCompare(b.id));
  const shuffles = [
    [4, 3, 2, 1, 0], [2, 0, 4, 1, 3], [1, 4, 0, 3, 2], [3, 1, 2, 4, 0],
  ];
  for (const order of shuffles) {
    const got = packTimedColumns(order.map(i => events[i])).sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(got, canonical, `same placements for order [${order.join(",")}]`);
  }
});

test("time-grid: same start ties break by duration (longer first) then id", () => {
  const placed = byId(packTimedColumns([item("short", 0, 30), item("long", 0, 90)]));
  assert.equal(placed.get("long")!.col, 0, "longer event claims col 0");
  assert.equal(placed.get("short")!.col, 1);
  const tied = byId(packTimedColumns([item("b", 0, 60), item("a", 0, 60)]));
  assert.equal(tied.get("a")!.col, 0, "equal spans → lexicographic id wins col 0");
  assert.equal(tied.get("b")!.col, 1);
});

test("time-grid: nowLineMinutes matches the local day key, null otherwise", () => {
  const now = new Date(2026, 6, 7, 14, 45); // local July 7, 14:45
  assert.equal(nowLineMinutes(now, "2026-07-07"), 885, "matching day → minutes since midnight");
  assert.equal(nowLineMinutes(now, "2026-07-08"), null, "other day → null");
  assert.equal(nowLineMinutes(new Date(2026, 0, 3, 0, 5), "2026-01-03"), 5, "day key is zero-padded");
});

test("time-grid: withMinutesOfDay keeps the date, sets local time, returns ISO", () => {
  const iso = new Date(2026, 6, 7, 9, 30, 42, 500).toISOString();
  const out = withMinutesOfDay(iso, 810); // 13:30
  assert.equal(new Date(out).toISOString(), out, "returns a canonical ISO string");
  const d = new Date(out);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 7, "local date preserved");
  assert.equal(d.getHours(), 13);
  assert.equal(d.getMinutes(), 30);
  assert.equal(d.getSeconds(), 0, "seconds zeroed");
  assert.equal(d.getMilliseconds(), 0, "millis zeroed");
  const midnight = new Date(withMinutesOfDay(iso, 0));
  assert.equal(midnight.getHours(), 0);
  assert.equal(midnight.getMinutes(), 0);
  assert.equal(midnight.getDate(), 7, "minute 0 stays on the same local day");
});

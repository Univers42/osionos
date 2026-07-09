/* ************************************************************************** */
/*  calendar-lanes.test.ts — week segmentation + first-fit lane packing       */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  segmentIntoWeeks, packWeekLanes, visibleSegments, overflowByDay,
} from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarLanes.ts";
import { buildMonthGrid } from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarGrid.ts";
import type { CalEvent, WeekSegment } from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarTypes.ts";

// July 2026, Monday start: Jul 1 is a Wednesday; grid runs Mon Jun 29 → Sun Aug 2.
const JULY = new Date(2026, 6, 1);
const gridFull = () => buildMonthGrid(JULY, { weekStartsOn: 1, showWeekends: true });
const gridNoWknd = () => buildMonthGrid(JULY, { weekStartsOn: 1, showWeekends: false });

const ev = (pageId: string, startKey: string, endKey: string = startKey): CalEvent => ({
  pageId,
  startKey,
  endKey,
  isRanged: endKey > startKey,
  startIso: `${startKey}T10:00:00.000Z`,
  endIso: endKey > startKey ? `${endKey}T10:00:00.000Z` : null,
});

const segsOf = (segments: readonly WeekSegment[], pageId: string): WeekSegment[] =>
  segments.filter(s => s.pageId === pageId).sort((a, b) => a.weekIndex - b.weekIndex);

test("calendar-lanes: July 2026 Mon-start grid sanity (Fri col 4 in both grids)", () => {
  const full = gridFull();
  assert.equal(full.weeks.length, 5, "5 week rows");
  assert.equal(full.cols, 7);
  assert.equal(full.rangeStart, "2026-06-29");
  assert.equal(full.rangeEnd, "2026-08-02");
  const fri = full.weeks[0].find(d => d.key === "2026-07-03")!;
  assert.equal(fri.col, 4, "Friday is col 4 with weekStartsOn:1");

  const hidden = gridNoWknd();
  assert.equal(hidden.cols, 5);
  assert.equal(hidden.weeks[0].length, 5, "weekend cells dropped");
  const friH = hidden.weeks[0].find(d => d.key === "2026-07-03")!;
  assert.equal(friH.col, 4, "Friday still col 4 when weekends hidden");
});

test("calendar-lanes: Fri→Tue splits into 2 segments across the week boundary (weekends shown)", () => {
  const segments = segmentIntoWeeks([ev("e", "2026-07-03", "2026-07-07")], gridFull());
  assert.equal(segments.length, 2);
  const [first, second] = segsOf(segments, "e");
  assert.equal(first.weekIndex, 0);
  assert.equal(first.startCol, 4, "starts on Friday, col 4");
  assert.equal(first.endCol, 6, "runs through Sunday col 6");
  assert.equal(first.continuesLeft, false);
  assert.equal(first.continuesRight, true);
  assert.equal(second.weekIndex, 1);
  assert.equal(second.startCol, 0, "resumes on Monday col 0");
  assert.equal(second.endCol, 1, "ends Tuesday col 1");
  assert.equal(second.continuesLeft, true);
  assert.equal(second.continuesRight, false);
  assert.ok(segments.every(s => s.lane === -1), "unpacked segments carry lane -1");
});

test("calendar-lanes: Fri→Tue with hidden weekends — first segment ENDS at col 4 (Fri)", () => {
  const segments = segmentIntoWeeks([ev("e", "2026-07-03", "2026-07-07")], gridNoWknd());
  assert.equal(segments.length, 2);
  const [first, second] = segsOf(segments, "e");
  assert.equal(first.startCol, 4);
  assert.equal(first.endCol, 4, "Friday is the last visible day of the row");
  assert.equal(first.continuesLeft, false);
  assert.equal(first.continuesRight, true);
  assert.equal(second.startCol, 0);
  assert.equal(second.endCol, 1);
  assert.equal(second.continuesLeft, true);
  assert.equal(second.continuesRight, false);
});

test("calendar-lanes: Sat→Sun-only event vanishes when weekends are hidden", () => {
  const segments = segmentIntoWeeks([ev("wknd", "2026-07-04", "2026-07-05")], gridNoWknd());
  assert.equal(segments.length, 0, "no visible day covered → no segments");
});

test("calendar-lanes: Fri→Mon with hidden weekends — two 1-day segments, carets through the gap", () => {
  const segments = segmentIntoWeeks([ev("e", "2026-07-03", "2026-07-06")], gridNoWknd());
  assert.equal(segments.length, 2);
  const [fri, mon] = segsOf(segments, "e");
  assert.equal(fri.weekIndex, 0);
  assert.equal(fri.startCol, 4);
  assert.equal(fri.endCol, 4, "one day wide");
  assert.equal(fri.continuesRight, true, "caret points into the hidden weekend");
  assert.equal(fri.continuesLeft, false);
  assert.equal(mon.weekIndex, 1);
  assert.equal(mon.startCol, 0);
  assert.equal(mon.endCol, 0, "one day wide");
  assert.equal(mon.continuesLeft, true, "caret points back through the hidden weekend");
  assert.equal(mon.continuesRight, false);
});

test("calendar-lanes: packWeekLanes stacks three overlapping events on lanes 0,1,2; a disjoint fourth reuses lane 0", () => {
  const events = [
    ev("a", "2026-07-07", "2026-07-09"),
    ev("b", "2026-07-08"),
    ev("c", "2026-07-08", "2026-07-10"),
    ev("d", "2026-07-11"),
  ];
  const packed = packWeekLanes(segmentIntoWeeks(events, gridFull()), events);
  assert.equal(segsOf(packed, "a")[0].lane, 0, "earliest start packs first");
  assert.equal(segsOf(packed, "c")[0].lane, 1, "longer Jul-8 starter above shorter");
  assert.equal(segsOf(packed, "b")[0].lane, 2, "third overlapper on lane 2");
  assert.equal(segsOf(packed, "d")[0].lane, 0, "no overlap → back to lane 0");
});

test("calendar-lanes: longer-first — same startKey, 10-day event takes lane 0 over 1-day event", () => {
  const events = [ev("short", "2026-07-06"), ev("long", "2026-07-06", "2026-07-15")];
  const packed = packWeekLanes(segmentIntoWeeks(events, gridFull()), events);
  const long = segsOf(packed, "long");
  assert.equal(long.length, 2, "10-day event spans two week rows");
  assert.ok(long.every(s => s.lane === 0), "long event owns lane 0 in every week");
  assert.equal(segsOf(packed, "short")[0].lane, 1, "1-day event pushed to lane 1");
});

test("calendar-lanes: sticky lanes — week-2 segment keeps its week-1 lane even when lane 0 is free", () => {
  const events = [
    ev("blocker", "2026-07-06", "2026-07-10"), // week 1 only, takes lane 0
    ev("span", "2026-07-08", "2026-07-15"),    // crosses into week 2
  ];
  const packed = packWeekLanes(segmentIntoWeeks(events, gridFull()), events);
  assert.equal(segsOf(packed, "blocker")[0].lane, 0);
  const [w1, w2] = segsOf(packed, "span");
  assert.equal(w1.lane, 1, "week-1 segment forced above the blocker");
  assert.equal(w2.continuesLeft, true);
  assert.equal(w2.lane, 1, "week-2 segment sticks to lane 1 (lane 0 is free but stickiness wins)");
});

test("calendar-lanes: overflowByDay — 5 point events on one day → 2 hidden, neighbors untouched", () => {
  const events = ["p1", "p2", "p3", "p4", "p5"].map(id => ev(id, "2026-07-08"));
  const grid = gridFull();
  const packed = packWeekLanes(segmentIntoWeeks(events, grid), events);
  const lanes = packed.map(s => s.lane).sort((a, b) => a - b);
  assert.deepEqual(lanes, [0, 1, 2, 3, 4], "five stacked lanes on the same day");
  const counts = overflowByDay(packed, grid, 3);
  assert.equal(counts.get("2026-07-08"), 2, "lanes 3 and 4 hidden");
  assert.equal(counts.get("2026-07-07"), undefined, "previous day untouched");
  assert.equal(counts.get("2026-07-09"), undefined, "next day untouched");
  assert.equal(counts.size, 1);
});

test("calendar-lanes: overflowByDay — an overflowed multi-day event increments EVERY day it covers", () => {
  const events = [
    ev("b1", "2026-07-06", "2026-07-10"),
    ev("b2", "2026-07-06", "2026-07-10"),
    ev("b3", "2026-07-06", "2026-07-10"),
    ev("m", "2026-07-08", "2026-07-09"),
  ];
  const grid = gridFull();
  const packed = packWeekLanes(segmentIntoWeeks(events, grid), events);
  assert.equal(segsOf(packed, "m")[0].lane, 3, "multi-day lands over the cap");
  const counts = overflowByDay(packed, grid, 3);
  assert.equal(counts.get("2026-07-08"), 1);
  assert.equal(counts.get("2026-07-09"), 1);
  assert.equal(counts.get("2026-07-07"), undefined, "day before its span absent");
  assert.equal(counts.get("2026-07-10"), undefined, "day after its span absent");
  assert.equal(counts.size, 2);
});

test("calendar-lanes: visibleSegments filters lane < maxLanes", () => {
  const events = ["p1", "p2", "p3", "p4", "p5"].map(id => ev(id, "2026-07-08"));
  const packed = packWeekLanes(segmentIntoWeeks(events, gridFull()), events);
  const visible = visibleSegments(packed, 3);
  assert.equal(visible.length, 3);
  assert.ok(visible.every(s => s.lane >= 0 && s.lane < 3));
  const hidden = packed.filter(s => !visible.includes(s)).map(s => s.lane).sort((a, b) => a - b);
  assert.deepEqual(hidden, [3, 4], "exactly the over-cap lanes dropped");
  assert.equal(visibleSegments(packed, 0).length, 0, "cap 0 hides everything packed");
});

test("calendar-lanes: deterministic under a fixed input permutation", () => {
  const events = [
    ev("a", "2026-07-07", "2026-07-09"),
    ev("b", "2026-07-08"),
    ev("c", "2026-07-08", "2026-07-10"),
    ev("d", "2026-07-11"),
    ev("blocker", "2026-07-06", "2026-07-10"),
    ev("span", "2026-07-08", "2026-07-15"),
  ];
  // Fixed permutation — no Math.random.
  const shuffled = [5, 2, 0, 4, 1, 3].map(i => events[i]);
  const grid = gridFull();
  const packedA = packWeekLanes(segmentIntoWeeks(events, grid), events);
  const packedB = packWeekLanes(segmentIntoWeeks(shuffled, grid), shuffled);
  assert.deepEqual(packedB, packedA, "packed segments identical regardless of input order");
  assert.deepEqual(overflowByDay(packedB, grid, 2), overflowByDay(packedA, grid, 2));
  assert.deepEqual(visibleSegments(packedB, 2), visibleSegments(packedA, 2));
});

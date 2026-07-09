/* ************************************************************************** */
/*  calendar-drag-math.test.ts — pure drag math for the calendar view        */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  hitTestDay, previewDrag, shiftIsoPreservingTime,
  applyMoveDrag, applyResizeStartDrag, applyResizeEndDrag, buildCreateProperties,
} from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarDragMath.ts";
import type { DragOrigin } from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarDragMath.ts";
import { toDayKey, diffDayKeys } from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarGrid.ts";
import type { CalEvent, CellRect } from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarTypes.ts";

// Local-time ISO builders so day-key assertions hold in any container TZ.
const isoAt = (y: number, m1: number, d: number, h = 10): string =>
  new Date(y, m1 - 1, d, h, 0, 0).toISOString();
const dayOf = (iso: string): string => toDayKey(new Date(iso));

const origin: DragOrigin = { startKey: "2026-07-06", endKey: "2026-07-08", anchorKey: "2026-07-07" };

const pointEvent = (): CalEvent => ({
  pageId: "p1", startKey: "2026-07-06", endKey: "2026-07-06",
  isRanged: false, startIso: isoAt(2026, 7, 6), endIso: null,
});
const rangedEvent = (): CalEvent => ({
  pageId: "p2", startKey: "2026-07-06", endKey: "2026-07-08",
  isRanged: true, startIso: isoAt(2026, 7, 6), endIso: isoAt(2026, 7, 8, 16),
});

interface CallLog { updates: Array<[string, string, string]>; ensures: number; }
const makeStubs = (endId: string | null = "end-prop") => {
  const log: CallLog = { updates: [], ensures: 0 };
  const updateProp = (pageId: string, propId: string, value: string): void => {
    log.updates.push([pageId, propId, value]);
  };
  const ensureEndProp = (): { id: string } | null => {
    log.ensures += 1;
    return endId ? { id: endId } : null;
  };
  return { log, updateProp, ensureEndProp };
};

// ─── previewDrag ─────────────────────────────────────────────────────────────

test("previewDrag move: shifts both ends by the anchor delta, duration preserved", () => {
  const p = previewDrag("move", origin, "2026-07-10");
  assert.deepEqual(p, { startKey: "2026-07-09", endKey: "2026-07-11" });
  assert.equal(diffDayKeys(p.endKey, p.startKey), diffDayKeys(origin.endKey, origin.startKey));
});

test("previewDrag move: backwards across a month boundary", () => {
  const p = previewDrag("move", origin, "2026-06-30");
  assert.deepEqual(p, { startKey: "2026-06-29", endKey: "2026-07-01" });
});

test("previewDrag resize-left past the end clamps to a point", () => {
  const p = previewDrag("resize-left", origin, "2026-07-20");
  assert.equal(p.startKey, "2026-07-08");
  assert.equal(p.endKey, "2026-07-08");
});

test("previewDrag resize-left before the start just extends", () => {
  const p = previewDrag("resize-left", origin, "2026-07-01");
  assert.deepEqual(p, { startKey: "2026-07-01", endKey: "2026-07-08" });
});

test("previewDrag resize-right before the start clamps to the start", () => {
  const p = previewDrag("resize-right", origin, "2026-07-01");
  assert.equal(p.startKey, "2026-07-06");
  assert.equal(p.endKey, "2026-07-06");
});

test("previewDrag create: backwards drag normalizes ascending; forward stays", () => {
  assert.deepEqual(previewDrag("create", origin, "2026-07-03"),
    { startKey: "2026-07-03", endKey: "2026-07-07" });
  assert.deepEqual(previewDrag("create", origin, "2026-07-12"),
    { startKey: "2026-07-07", endKey: "2026-07-12" });
  assert.deepEqual(previewDrag("create", origin, "2026-07-07"),
    { startKey: "2026-07-07", endKey: "2026-07-07" });
});

// ─── hitTestDay ──────────────────────────────────────────────────────────────

// Two rows × two cols with a 10px gutter between cells.
const cell = (dayKey: string, left: number, top: number): CellRect =>
  ({ dayKey, left, top, right: left + 100, bottom: top + 100 });
const cells: CellRect[] = [
  cell("2026-07-06", 0, 0), cell("2026-07-07", 110, 0),
  cell("2026-07-13", 0, 110), cell("2026-07-14", 110, 110),
];

test("hitTestDay: point inside a cell hits that day", () => {
  assert.equal(hitTestDay(cells, 50, 50), "2026-07-06");
  assert.equal(hitTestDay(cells, 150, 150), "2026-07-14");
});

test("hitTestDay: point in the gap between rows snaps to the nearest cell", () => {
  assert.equal(hitTestDay(cells, 50, 102), "2026-07-06", "just below row 1 → row 1");
  assert.equal(hitTestDay(cells, 50, 108), "2026-07-13", "just above row 2 → row 2");
});

test("hitTestDay: far outside the grid clamps to a corner cell", () => {
  assert.equal(hitTestDay(cells, 5000, 5000), "2026-07-14", "bottom-right corner");
  assert.equal(hitTestDay(cells, -5000, -5000), "2026-07-06", "top-left corner");
});

test("hitTestDay: empty snapshot → null", () => {
  assert.equal(hitTestDay([], 50, 50), null);
});

// ─── shiftIsoPreservingTime ──────────────────────────────────────────────────

test("shiftIsoPreservingTime keeps the time-of-day across a day shift", () => {
  assert.equal(shiftIsoPreservingTime("2026-07-07T14:30:00.000Z", 3), "2026-07-10T14:30:00.000Z");
  assert.equal(shiftIsoPreservingTime("2026-07-07T14:30:00.000Z", -7), "2026-06-30T14:30:00.000Z");
  assert.equal(shiftIsoPreservingTime("2026-07-07T14:30:00.000Z", 0), "2026-07-07T14:30:00.000Z");
});

// ─── applyMoveDrag ───────────────────────────────────────────────────────────

test("applyMoveDrag on a point event: one start update, ensureEndProp never called", () => {
  const { log, updateProp, ensureEndProp } = makeStubs();
  applyMoveDrag(pointEvent(), 2, "start-prop", updateProp, ensureEndProp);
  assert.equal(log.ensures, 0, "no end prop created by a move");
  assert.equal(log.updates.length, 1);
  const [pageId, propId, value] = log.updates[0];
  assert.equal(pageId, "p1");
  assert.equal(propId, "start-prop");
  assert.equal(dayOf(value), "2026-07-08", "start shifted by 2 days");
});

test("applyMoveDrag with deltaDays 0 → zero calls", () => {
  const { log, updateProp, ensureEndProp } = makeStubs();
  applyMoveDrag(pointEvent(), 0, "start-prop", updateProp, ensureEndProp);
  assert.equal(log.updates.length, 0);
  assert.equal(log.ensures, 0);
});

test("applyMoveDrag on a ranged event: start+end both shift, duration preserved", () => {
  const ev = rangedEvent();
  const { log, updateProp, ensureEndProp } = makeStubs("end-prop");
  applyMoveDrag(ev, 3, "start-prop", updateProp, ensureEndProp);
  assert.equal(log.updates.length, 2);
  const [startCall, endCall] = log.updates;
  assert.deepEqual([startCall[0], startCall[1]], ["p2", "start-prop"]);
  assert.deepEqual([endCall[0], endCall[1]], ["p2", "end-prop"]);
  assert.equal(dayOf(startCall[2]), "2026-07-09");
  assert.equal(dayOf(endCall[2]), "2026-07-11");
  assert.equal(
    diffDayKeys(dayOf(endCall[2]), dayOf(startCall[2])),
    diffDayKeys(ev.endKey, ev.startKey),
    "duration preserved",
  );
});

// ─── applyResizeStartDrag ────────────────────────────────────────────────────

test("applyResizeStartDrag with delta 0 → no calls", () => {
  const { log, updateProp } = makeStubs();
  applyResizeStartDrag(rangedEvent(), "2026-07-06", "start-prop", updateProp);
  assert.equal(log.updates.length, 0);
});

test("applyResizeStartDrag writes the start at the new key, time preserved", () => {
  const { log, updateProp } = makeStubs();
  applyResizeStartDrag(rangedEvent(), "2026-07-04", "start-prop", updateProp);
  assert.equal(log.updates.length, 1);
  const [pageId, propId, value] = log.updates[0];
  assert.deepEqual([pageId, propId], ["p2", "start-prop"]);
  assert.equal(dayOf(value), "2026-07-04");
  assert.equal(new Date(value).getTime() - new Date(isoAt(2026, 7, 4)).getTime(), 0,
    "same time-of-day as the original start");
});

// ─── applyResizeEndDrag ──────────────────────────────────────────────────────

test("applyResizeEndDrag on a point event: ensures the end prop once, writes the new day", () => {
  const { log, updateProp, ensureEndProp } = makeStubs("end-prop");
  applyResizeEndDrag(pointEvent(), "2026-07-09", updateProp, ensureEndProp);
  assert.equal(log.ensures, 1, "ensureEndProp called exactly once");
  assert.equal(log.updates.length, 1);
  const [pageId, propId, value] = log.updates[0];
  assert.deepEqual([pageId, propId], ["p1", "end-prop"]);
  assert.equal(dayOf(value), "2026-07-09", "end iso lands on the new key");
});

test("applyResizeEndDrag on a ranged event keeps the END's time-of-day", () => {
  const ev = rangedEvent(); // end at 16:00 local
  const { log, updateProp, ensureEndProp } = makeStubs("end-prop");
  applyResizeEndDrag(ev, "2026-07-10", updateProp, ensureEndProp);
  assert.equal(log.updates.length, 1);
  const value = log.updates[0][2];
  assert.equal(dayOf(value), "2026-07-10");
  assert.equal(value, isoAt(2026, 7, 10, 16), "16:00 end time preserved");
});

test("applyResizeEndDrag bails without writing when the end prop cannot be ensured", () => {
  const { log, updateProp, ensureEndProp } = makeStubs(null);
  applyResizeEndDrag(pointEvent(), "2026-07-09", updateProp, ensureEndProp);
  assert.equal(log.ensures, 1);
  assert.equal(log.updates.length, 0);
});

// ─── buildCreateProperties ───────────────────────────────────────────────────

test("buildCreateProperties: single-day preview → start only, even with an end prop", () => {
  const props = buildCreateProperties(
    { startKey: "2026-07-06", endKey: "2026-07-06" }, "start-prop", "end-prop");
  assert.deepEqual(Object.keys(props), ["start-prop"]);
  assert.equal(dayOf(props["start-prop"]), "2026-07-06");
});

test("buildCreateProperties: 3-day preview with an end prop → both keys", () => {
  const props = buildCreateProperties(
    { startKey: "2026-07-06", endKey: "2026-07-08" }, "start-prop", "end-prop");
  assert.deepEqual(Object.keys(props).sort(), ["end-prop", "start-prop"]);
  assert.equal(dayOf(props["start-prop"]), "2026-07-06");
  assert.equal(dayOf(props["end-prop"]), "2026-07-08");
});

test("buildCreateProperties: 3-day preview without an end prop → start only", () => {
  const props = buildCreateProperties(
    { startKey: "2026-07-06", endKey: "2026-07-08" }, "start-prop", null);
  assert.deepEqual(Object.keys(props), ["start-prop"]);
});

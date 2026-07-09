/* ************************************************************************** */
/*  calendar-events.test.ts — property resolution + page→event normalization */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCalendarProps, pageToEvent, eventDurationDays, sortForPacking, eventsOnDay,
} from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarEvents.ts";
import type { CalEvent } from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarTypes.ts";
import type { Page, SchemaProperty } from "../../src/shared/notion-database-sys/src/types/database.ts";

const prop = (id: string, type: string, extra: Record<string, unknown> = {}): SchemaProperty =>
  ({ id, name: id, type, ...extra } as unknown as SchemaProperty);

const page = (id: string, properties: Record<string, unknown>): Page =>
  ({ id, properties } as unknown as Page);

const ev = (pageId: string, startKey: string, endKey: string): CalEvent => ({
  pageId, startKey, endKey,
  isRanged: endKey !== startKey,
  startIso: `${startKey}T09:00:00`,
  endIso: endKey !== startKey ? `${endKey}T09:00:00` : null,
});

// A (date) first, B (date) second, T (text) — insertion order matters for fallback.
const baseProps = (): Record<string, SchemaProperty> => ({
  propA: prop("propA", "date"),
  propB: prop("propB", "date"),
  propT: prop("propT", "text"),
});

test("calendar-events: showCalendarBy naming a date prop wins as startProp", () => {
  const { startProp, endProp } = resolveCalendarProps(baseProps(), "propB");
  assert.equal(startProp?.id, "propB");
  assert.equal(endProp, null, "B has no endPropertyId pairing");
});

test("calendar-events: showCalendarBy naming a text prop falls back to first date prop", () => {
  const { startProp } = resolveCalendarProps(baseProps(), "propT");
  assert.equal(startProp?.id, "propA");
});

test("calendar-events: undefined showCalendarBy resolves the first date prop", () => {
  const { startProp } = resolveCalendarProps(baseProps(), undefined);
  assert.equal(startProp?.id, "propA");
});

test("calendar-events: start's endPropertyId pairing resolves the end date prop", () => {
  const props = baseProps();
  props.propA = prop("propA", "date", { endPropertyId: "propB" });
  const { startProp, endProp } = resolveCalendarProps(props, undefined);
  assert.equal(startProp?.id, "propA");
  assert.equal(endProp?.id, "propB");
});

test("calendar-events: endPropertyId pointing at a non-date prop yields endProp null", () => {
  const props = baseProps();
  props.propA = prop("propA", "date", { endPropertyId: "propT" });
  assert.equal(resolveCalendarProps(props, undefined).endProp, null, "text end prop rejected");

  const dangling = baseProps();
  dangling.propA = prop("propA", "date", { endPropertyId: "nope" });
  assert.equal(resolveCalendarProps(dangling, undefined).endProp, null, "dangling id rejected");
});

test("calendar-events: no date props → both null; due_date counts as a date type", () => {
  const none = resolveCalendarProps({ propT: prop("propT", "text") }, undefined);
  assert.equal(none.startProp, null);
  assert.equal(none.endProp, null);

  const withDue = resolveCalendarProps(
    { propT: prop("propT", "text"), due: prop("due", "due_date") },
    undefined,
  );
  assert.equal(withDue.startProp?.id, "due", "due_date accepted as calendar driver");
});

test("calendar-events: pageToEvent missing or garbage start value → null", () => {
  assert.equal(pageToEvent(page("p1", {}), "propA", null), null, "missing value");
  assert.equal(pageToEvent(page("p2", { propA: "not-a-date" }), "propA", null), null, "garbage string");
  assert.equal(pageToEvent(page("p3", { propA: 42 }), "propA", null), null, "non-string value");
  assert.equal(pageToEvent(page("p4", { propA: "" }), "propA", null), null, "empty string");
});

test("calendar-events: end after start (different days) → ranged, inclusive endKey, ISO kept", () => {
  const p = page("p1", { propA: "2026-03-10T09:00:00", propB: "2026-03-12T17:00:00" });
  const event = pageToEvent(p, "propA", "propB")!;
  assert.ok(event, "event produced");
  assert.equal(event.isRanged, true);
  assert.equal(event.startKey, "2026-03-10");
  assert.equal(event.endKey, "2026-03-12", "endKey is the end's own day (inclusive)");
  assert.equal(event.startIso, "2026-03-10T09:00:00", "original start ISO preserved");
  assert.equal(event.endIso, "2026-03-12T17:00:00", "original end ISO preserved");
  assert.equal(event.pageId, "p1");
});

test("calendar-events: end before start collapses to a point", () => {
  const p = page("p1", { propA: "2026-03-10T09:00:00", propB: "2026-03-08T09:00:00" });
  const event = pageToEvent(p, "propA", "propB")!;
  assert.equal(event.startKey, "2026-03-10");
  assert.equal(event.endKey, event.startKey, "endKey clamped to startKey");
  assert.equal(event.isRanged, false);
  assert.equal(event.endIso, null, "backwards end ISO dropped");
});

test("calendar-events: end on the same day → isRanged one-day range (startKey === endKey)", () => {
  const p = page("p1", { propA: "2026-03-10T09:00:00", propB: "2026-03-10T23:00:00" });
  const event = pageToEvent(p, "propA", "propB")!;
  assert.equal(event.isRanged, true, "same-day end is still a range");
  assert.equal(event.startKey, "2026-03-10");
  assert.equal(event.endKey, "2026-03-10", "1-day range: startKey === endKey");
  assert.equal(event.endIso, "2026-03-10T23:00:00");
});

test("calendar-events: no end prop (or missing end value) → point", () => {
  const noEndProp = pageToEvent(page("p1", { propA: "2026-03-10T09:00:00" }), "propA", null)!;
  assert.equal(noEndProp.isRanged, false);
  assert.equal(noEndProp.endKey, noEndProp.startKey);
  assert.equal(noEndProp.endIso, null);

  const emptyEnd = pageToEvent(page("p2", { propA: "2026-03-10T09:00:00" }), "propA", "propB")!;
  assert.equal(emptyEnd.isRanged, false, "end prop configured but value absent → point");
  assert.equal(emptyEnd.endKey, emptyEnd.startKey);
});

test("calendar-events: eventDurationDays — 1 for a point, 3 for a 3-day span", () => {
  assert.equal(eventDurationDays(ev("pt", "2026-03-10", "2026-03-10")), 1);
  assert.equal(eventDurationDays(ev("span", "2026-03-10", "2026-03-12")), 3);
});

test("calendar-events: sortForPacking — start asc, then longer first, then pageId asc", () => {
  const earlier = ev("b", "2026-03-09", "2026-03-09");
  const point = ev("z", "2026-03-10", "2026-03-10");
  const spanA = ev("a", "2026-03-10", "2026-03-12");
  const spanA2 = ev("a2", "2026-03-10", "2026-03-12");
  const input = [point, spanA2, earlier, spanA];
  const sorted = sortForPacking(input);
  assert.deepEqual(sorted.map(e => e.pageId), ["b", "a", "a2", "z"]);
  assert.deepEqual(input.map(e => e.pageId), ["z", "a2", "b", "a"], "input not mutated");
});

test("calendar-events: eventsOnDay covers start/middle/end days, excludes outside, packs order", () => {
  const span = ev("span", "2026-03-10", "2026-03-12");
  const point = ev("pt", "2026-03-11", "2026-03-11");
  const outside = ev("out", "2026-03-13", "2026-03-14");
  const all = [point, outside, span];

  assert.deepEqual(eventsOnDay(all, "2026-03-10").map(e => e.pageId), ["span"], "start day");
  assert.deepEqual(eventsOnDay(all, "2026-03-11").map(e => e.pageId), ["span", "pt"],
    "middle day, packing order (earlier start first)");
  assert.deepEqual(eventsOnDay(all, "2026-03-12").map(e => e.pageId), ["span"], "end day inclusive");
  assert.deepEqual(eventsOnDay(all, "2026-03-09"), [], "before → excluded");
  assert.deepEqual(eventsOnDay(all, "2026-03-13").map(e => e.pageId), ["out"], "neighbor unaffected");
});

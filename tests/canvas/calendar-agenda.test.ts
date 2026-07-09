/* ************************************************************************** */
/*  calendar-agenda.test.ts — day-grouped agenda sections (buildAgenda)       */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { buildAgenda } from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarAgenda.ts";
import type { CalEvent } from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarTypes.ts";

const ev = (pageId: string, startKey: string, endKey: string = startKey): CalEvent => ({
  pageId,
  startKey,
  endKey,
  isRanged: endKey !== startKey,
  startIso: `${startKey}T09:00:00`,
  endIso: endKey !== startKey ? `${endKey}T17:00:00` : null,
});

test("calendar-agenda: skips empty days — only populated days become sections, in order", () => {
  const events = [ev("a", "2026-07-06"), ev("b", "2026-07-09")];
  const sections = buildAgenda(events, "2026-07-06", 7);
  assert.equal(sections.length, 2, "exactly 2 non-empty days");
  assert.deepEqual(sections.map(s => s.key), ["2026-07-06", "2026-07-09"], "keys in chronological order");
  assert.deepEqual(sections[0].events.map(e => e.pageId), ["a"]);
  assert.deepEqual(sections[1].events.map(e => e.pageId), ["b"]);
});

test("calendar-agenda: a 3-day ranged event appears in every covered day's section", () => {
  const events = [ev("span", "2026-07-07", "2026-07-09")];
  const sections = buildAgenda(events, "2026-07-06", 7);
  assert.deepEqual(sections.map(s => s.key), ["2026-07-07", "2026-07-08", "2026-07-09"], "one section per covered day, none outside");
  for (const s of sections) {
    assert.deepEqual(s.events.map(e => e.pageId), ["span"], `event present on ${s.key}`);
  }
});

test("calendar-agenda: section events are in packing order (start asc, longer first, pageId tiebreak)", () => {
  const events = [
    ev("short", "2026-07-06"),                 // starts on the day, 1 day
    ev("long", "2026-07-06", "2026-07-08"),    // starts on the day, 3 days → before "short"
    ev("early", "2026-07-05", "2026-07-06"),   // earlier start → first
    ev("zshort", "2026-07-06"),                // same start+duration as "short" → pageId order
  ];
  const sections = buildAgenda(events, "2026-07-06", 1);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].key, "2026-07-06");
  assert.deepEqual(
    sections[0].events.map(e => e.pageId),
    ["early", "long", "short", "zshort"],
    "start asc → longer first → pageId",
  );
});

test("calendar-agenda: days=0 → [], and window end is exclusive-ish", () => {
  const events = [ev("in", "2026-07-08"), ev("out", "2026-07-09")];
  assert.deepEqual(buildAgenda(events, "2026-07-06", 0), [], "days=0 → empty");
  const sections = buildAgenda(events, "2026-07-06", 3); // covers 06,07,08
  assert.deepEqual(sections.map(s => s.key), ["2026-07-08"], "last covered day included");
  assert.ok(
    !sections.some(s => s.events.some(e => e.pageId === "out")),
    "event after fromKey+days-1 is absent",
  );
});

test("calendar-agenda: edge cases — no events, negative days, pre-window spill-in, month rollover", () => {
  assert.deepEqual(buildAgenda([], "2026-07-06", 7), [], "no events → no sections");
  assert.deepEqual(buildAgenda([ev("a", "2026-07-06")], "2026-07-06", -1), [], "negative days → empty");

  // Event started before the window but spanning into it shows on in-window days only.
  const spill = buildAgenda([ev("spill", "2026-07-04", "2026-07-07")], "2026-07-06", 7);
  assert.deepEqual(spill.map(s => s.key), ["2026-07-06", "2026-07-07"], "in-window covered days only");

  // Window crossing a month boundary keys days correctly.
  const roll = buildAgenda([ev("aug", "2026-08-01")], "2026-07-30", 4); // 07-30..08-02
  assert.deepEqual(roll.map(s => s.key), ["2026-08-01"], "month rollover day key");
});

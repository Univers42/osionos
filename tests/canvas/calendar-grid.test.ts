/* ************************************************************************** */
/*  calendar-grid.test.ts — pure month/week grid construction + day-key math */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMonthGrid, buildWeekGrid, buildDayGrid, dayAt,
  toDayKey, fromDayKey, addDaysToKey, diffDayKeys,
} from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarGrid.ts";
import type { GridOptions } from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarGrid.ts";
import type { CalendarGrid, DayInfo } from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarTypes.ts";

const MON: GridOptions = { weekStartsOn: 1, showWeekends: true };
const SUN: GridOptions = { weekStartsOn: 0, showWeekends: true };
const MON_NO_WE: GridOptions = { weekStartsOn: 1, showWeekends: false };

const flat = (grid: CalendarGrid): DayInfo[] => grid.weeks.flat();

test("calendar-grid: July 2026, Monday start — 5 full weeks, exact range", () => {
  const grid = buildMonthGrid(new Date(2026, 6, 15), MON);
  assert.equal(grid.weeks.length, 5, "July 2026 fits in 5 rows");
  for (const week of grid.weeks) assert.equal(week.length, 7, "every week has 7 days");
  assert.equal(grid.cols, 7);
  assert.equal(grid.weekStartsOn, 1);
  assert.equal(grid.rangeStart, "2026-06-29", "leading Monday of the first row");
  assert.equal(grid.rangeEnd, "2026-08-02", "trailing Sunday of the last row");
  assert.equal(grid.weeks[0][0].col, 0, "first day sits in column 0");
  assert.equal(grid.weeks[0][0].key, "2026-06-29");
});

test("calendar-grid: inMonth flags flip exactly at the month edges", () => {
  const grid = buildMonthGrid(new Date(2026, 6, 15), MON);
  const first = grid.weeks[0];
  assert.equal(first[0].inMonth, false, "Jun 29 is outside July");
  assert.equal(first[1].inMonth, false, "Jun 30 is outside July");
  assert.equal(first[2].inMonth, true, "Jul 1 is inside July");
  const last = grid.weeks[4];
  assert.equal(last[4].inMonth, true, "Jul 31 (Friday) is inside July");
  assert.equal(last[5].inMonth, false, "Aug 1 is outside July");
  assert.equal(last[6].inMonth, false, "Aug 2 is outside July");
  // weekIndex/isWeekend bookkeeping on the same grid.
  grid.weeks.forEach((week, w) => week.forEach(d => assert.equal(d.weekIndex, w)));
  assert.equal(last[5].isWeekend, true, "Saturday flagged weekend");
  assert.equal(last[6].isWeekend, true, "Sunday flagged weekend");
  assert.equal(first[0].isWeekend, false, "Monday not weekend");
});

test("calendar-grid: August 2026 (1st is Saturday, 31 days) needs 6 rows", () => {
  const grid = buildMonthGrid(new Date(2026, 7, 10), MON);
  assert.equal(grid.weeks.length, 6, "late-starting 31-day month spills into a 6th row");
  for (const week of grid.weeks) assert.equal(week.length, 7);
  assert.equal(grid.rangeStart, "2026-07-27", "Monday before Sat Aug 1");
  assert.equal(grid.rangeEnd, "2026-09-06", "Sunday after Mon Aug 31");
});

test("calendar-grid: February 2027 (1st is Monday, 28 days) is exactly 4 rows", () => {
  const grid = buildMonthGrid(new Date(2027, 1, 14), MON);
  assert.equal(grid.weeks.length, 4, "perfectly aligned February needs only 4 rows");
  assert.equal(grid.rangeStart, "2027-02-01");
  assert.equal(grid.rangeEnd, "2027-02-28");
  assert.ok(flat(grid).every(d => d.inMonth), "no out-of-month padding days");
});

test("calendar-grid: weekStartsOn 0 shifts the range onto Sundays", () => {
  const grid = buildMonthGrid(new Date(2026, 6, 15), SUN);
  assert.equal(grid.rangeStart, "2026-06-28", "first row starts on Sunday Jun 28");
  assert.equal(grid.weeks[0][0].date.getDay(), 0, "column 0 is a Sunday");
  assert.equal(grid.rangeEnd, "2026-08-01", "last row ends on Saturday Aug 1");
  assert.equal(grid.weeks.length, 5);
});

test("calendar-grid: showWeekends false — 5 contiguous weekday columns", () => {
  const grid = buildMonthGrid(new Date(2026, 6, 15), MON_NO_WE);
  assert.equal(grid.cols, 5);
  for (const week of grid.weeks) {
    assert.equal(week.length, 5, "each row holds Mon..Fri only");
    week.forEach((d, i) => assert.equal(d.col, i, "col indexes 0..4 contiguous"));
  }
  assert.ok(flat(grid).every(d => !d.isWeekend), "no weekend DayInfo survives");
  assert.equal(grid.rangeStart, "2026-06-29", "range still starts on the Monday");
  assert.equal(grid.rangeEnd, "2026-07-31", "range ends on the last Friday");
});

test("calendar-grid: day-key helpers roundtrip and cross boundaries by calendar days", () => {
  // toDayKey/fromDayKey roundtrip (zero-padded).
  assert.equal(toDayKey(fromDayKey("2026-07-15")), "2026-07-15");
  assert.equal(toDayKey(new Date(2026, 0, 5)), "2026-01-05", "months/days zero-padded");
  const d = fromDayKey("2026-01-05");
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 0, 5, 0], "local midnight");
  // addDaysToKey across a month boundary, both directions.
  assert.equal(addDaysToKey("2026-07-31", 1), "2026-08-01");
  assert.equal(addDaysToKey("2026-08-01", -1), "2026-07-31");
  assert.equal(addDaysToKey("2026-12-31", 1), "2027-01-01", "year boundary");
  // diffDayKeys across the US DST spring-forward (Mar 8 2026): calendar days, not ms/86400000.
  assert.equal(diffDayKeys("2026-03-09", "2026-03-06"), 3, "DST-spanning span counts whole days");
  assert.equal(diffDayKeys("2026-03-06", "2026-03-09"), -3, "signed the other way");
  assert.equal(diffDayKeys("2026-07-15", "2026-07-15"), 0);
});

test("calendar-grid: weekNumbers are ISO — Dec 29 2025 is week 1 of 2026", () => {
  const w1 = buildWeekGrid(new Date(2025, 11, 29), MON);
  assert.equal(w1.weeks.length, 1);
  assert.equal(w1.weeks[0].length, 7);
  assert.equal(w1.weekNumbers.length, 1);
  assert.equal(w1.weekNumbers[0], 1, "week containing the first Thursday of 2026");
  assert.equal(w1.rangeStart, "2025-12-29");
  assert.equal(w1.rangeEnd, "2026-01-04");

  const mid = buildWeekGrid(new Date(2026, 6, 15), MON);
  assert.equal(mid.weekNumbers[0], 29, "mid-July 2026 is ISO week 29");

  const month = buildMonthGrid(new Date(2026, 6, 15), MON);
  assert.deepEqual(month.weekNumbers, [27, 28, 29, 30, 31], "one ISO number per row");
});

test("calendar-grid: buildDayGrid is a 1x1 grid whose range collapses", () => {
  const grid = buildDayGrid(new Date(2026, 6, 15));
  assert.equal(grid.weeks.length, 1);
  assert.equal(grid.weeks[0].length, 1);
  assert.equal(grid.cols, 1);
  assert.equal(grid.rangeStart, grid.rangeEnd);
  assert.equal(grid.rangeStart, "2026-07-15");
  const day = grid.weeks[0][0];
  assert.equal(day.col, 0);
  assert.equal(day.weekIndex, 0);
  assert.equal(day.inMonth, true);
  assert.equal(day.isWeekend, false, "Wed Jul 15 is not a weekend");
  assert.equal(buildDayGrid(new Date(2026, 6, 18)).weeks[0][0].isWeekend, true, "Sat Jul 18 is");
});

test("calendar-grid: dayAt hits the right cell and returns null out of range", () => {
  const grid = buildMonthGrid(new Date(2026, 6, 15), MON);
  assert.equal(dayAt(grid, 0, 0)?.key, "2026-06-29");
  assert.equal(dayAt(grid, 2, 3)?.key, "2026-07-16", "row 2 col 3 = Thu Jul 16");
  assert.equal(dayAt(grid, 4, 6)?.key, "2026-08-02", "last cell");
  assert.equal(dayAt(grid, 5, 0), null, "weekIndex past the last row");
  assert.equal(dayAt(grid, -1, 0), null, "negative weekIndex");
  assert.equal(dayAt(grid, 0, 7), null, "col past the last column");
  const noWe = buildMonthGrid(new Date(2026, 6, 15), MON_NO_WE);
  assert.equal(dayAt(noWe, 0, 4)?.key, "2026-07-03", "col 4 is Friday when weekends hidden");
  assert.equal(dayAt(noWe, 0, 5), null, "col 5 does not exist without weekends");
});

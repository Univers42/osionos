/* ************************************************************************** */
/*  calendar-keyboard.test.ts — pure shortcut resolution for the calendar    */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCalendarShortcut, isTypingTarget,
} from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarKeyboard.ts";
import type { CalendarAction } from "../../src/shared/notion-database-sys/src/components/views/calendar/model/calendarTypes.ts";

const free = { metaOrCtrl: false, alt: false, typing: false };

test("calendar-keyboard: full shortcut map resolves", () => {
  const expected: Record<string, CalendarAction> = {
    t: "today",
    j: "next",
    n: "next",
    k: "prev",
    p: "prev",
    m: "month-mode",
    w: "week-mode",
    d: "day-mode",
    a: "agenda-mode",
    c: "create",
  };
  for (const [key, action] of Object.entries(expected)) {
    assert.equal(resolveCalendarShortcut(key, free), action, `'${key}' → ${action}`);
  }
});

test("calendar-keyboard: uppercase keys map via toLowerCase", () => {
  assert.equal(resolveCalendarShortcut("T", free), "today");
  assert.equal(resolveCalendarShortcut("J", free), "next");
  assert.equal(resolveCalendarShortcut("A", free), "agenda-mode");
  assert.equal(resolveCalendarShortcut("C", free), "create");
});

test("calendar-keyboard: typing suppresses every shortcut", () => {
  const typing = { metaOrCtrl: false, alt: false, typing: true };
  for (const key of ["t", "j", "n", "k", "p", "m", "w", "d", "a", "c"]) {
    assert.equal(resolveCalendarShortcut(key, typing), null, `'${key}' while typing`);
  }
});

test("calendar-keyboard: modifiers suppress shortcuts", () => {
  assert.equal(resolveCalendarShortcut("t", { metaOrCtrl: true, alt: false, typing: false }), null, "meta/ctrl");
  assert.equal(resolveCalendarShortcut("t", { metaOrCtrl: false, alt: true, typing: false }), null, "alt");
  assert.equal(resolveCalendarShortcut("c", { metaOrCtrl: true, alt: true, typing: true }), null, "all held");
});

test("calendar-keyboard: unknown keys resolve to null", () => {
  assert.equal(resolveCalendarShortcut("z", free), null);
  assert.equal(resolveCalendarShortcut("Escape", free), null);
  assert.equal(resolveCalendarShortcut("", free), null);
  assert.equal(resolveCalendarShortcut("1", free), null);
});

test("calendar-keyboard: isTypingTarget matches form tags case-insensitively", () => {
  assert.equal(isTypingTarget("INPUT", false), true);
  assert.equal(isTypingTarget("textarea", false), true, "lowercase tag");
  assert.equal(isTypingTarget("SELECT", false), true);
  assert.equal(isTypingTarget("Select", false), true, "mixed case");
  assert.equal(isTypingTarget("DIV", false), false);
  assert.equal(isTypingTarget("BUTTON", false), false);
  // document/window targets have no tagName — must not throw, must be non-typing.
  assert.equal(isTypingTarget(undefined, false), false, "undefined tag");
});

test("calendar-keyboard: contentEditable is typing regardless of tag", () => {
  assert.equal(isTypingTarget("DIV", true), true);
  assert.equal(isTypingTarget("SPAN", true), true);
  assert.equal(isTypingTarget("INPUT", true), true);
});

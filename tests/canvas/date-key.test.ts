/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   date-key.test.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Regression guard for the bug: osionos_tasks.due_at is a timestamptz, so a due
// date round-tripped through the bridge came back as a full timestamp and was
// handed straight to <input type="date">, which rejects anything but yyyy-MM-dd
// ('The specified value "2026-09-19T08:54:05.240944+00:00" does not conform…').

import assert from "node:assert/strict";
import test from "node:test";

import { toDateKey, todayKey } from "../../src/shared/lib/date/dateKey.ts";

test("toDateKey narrows a postgres timestamptz to its calendar key", () => {
  assert.equal(toDateKey("2026-09-19T08:54:05.240944+00:00"), "2026-09-19");
  assert.equal(toDateKey("2026-06-08T00:41:04.006+00:00"), "2026-06-08");
  assert.equal(toDateKey("2026-06-28T10:43:07.232489+00:00"), "2026-06-28");
});

test("toDateKey leaves an already-narrow date key untouched", () => {
  assert.equal(toDateKey("2026-09-19"), "2026-09-19");
});

test("toDateKey yields '' for every absent or unusable value", () => {
  assert.equal(toDateKey(undefined), "");
  assert.equal(toDateKey(null), "");
  assert.equal(toDateKey(""), "");
  assert.equal(toDateKey("not a date"), "");
  assert.equal(toDateKey("19/09/2026"), "");
});

test("toDateKey slices rather than re-parsing, so a UTC midnight never slips a day", () => {
  // Through `new Date(...)` this is 2026-01-01 in UTC but 2025-12-31 for any
  // negative-offset zone — which would mark a task due today as overdue.
  assert.equal(toDateKey("2026-01-01T00:00:00+00:00"), "2026-01-01");
});

test("todayKey is a well-formed local calendar key", () => {
  assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(toDateKey(todayKey()), todayKey());
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-date-format.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Regression: a live-DB date column holding an unparseable value (e.g. MySQL
// "0000-00-00", or a text column the mapper typed as `date`) used to crash the
// whole DatabaseBlock — the cell renderers called `new Date(v).toLocaleDateString(opts)`
// / date-fns `format(new Date(v), …)`, both of which THROW `RangeError: Invalid
// time value` on an invalid Date. safeDateFormat returns null instead.

import assert from "node:assert/strict";
import test from "node:test";

import { safeDateFormat } from "../../src/shared/notion-database-sys/src/utils/format.ts";

test("safeDateFormat returns null (never throws) for unparseable / empty values", () => {
  for (const bad of ["0000-00-00", "not a date", "", null, undefined, "Reims", "{}", NaN]) {
    assert.equal(safeDateFormat(bad as unknown), null, `expected null for ${String(bad)}`);
  }
});

test("safeDateFormat parses ISO and engine-native (MySQL) date strings leniently", () => {
  assert.equal(safeDateFormat("2026-06-26T14:00:00Z"), "Jun 26, 2026");
  assert.equal(safeDateFormat("2026-06-26 14:00:00"), "Jun 26, 2026"); // MySQL datetime (space, not ISO 'T')
  assert.equal(safeDateFormat("2026-06-26"), "Jun 26, 2026");
  assert.equal(safeDateFormat("2026-06-26", "MMM d"), "Jun 26"); // custom pattern
});

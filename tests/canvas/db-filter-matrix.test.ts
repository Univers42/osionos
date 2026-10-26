/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   db-filter-matrix.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Every filter operator against every cell shape a database view can hold
// (stored and computed), checked two ways: concrete Notion-parity cases, and
// invariants over the whole cross product (an operator and its negation never
// agree, no combination throws).

import assert from "node:assert/strict";
import test from "node:test";

import { matchesFilterValue, localDay } from "../../src/shared/notion-database-sys/src/lib/filter/evaluateFilter.ts";
import { isIncompleteFilter, VALUELESS_OPERATORS } from "../../src/shared/notion-database-sys/src/lib/filter/filterHelpers.ts";
import { compareValues } from "../../src/shared/notion-database-sys/src/lib/filter/compareValues.ts";
import { FILTER_OPERATORS as OPERATORS, needsValue } from "../../src/shared/notion-database-sys/src/components/filters/constants.ts";
import type { FilterOperator } from "../../src/shared/notion-database-sys/src/types/database.ts";

const match = (val: unknown, operator: FilterOperator, value: unknown = "") =>
  matchesFilterValue(val, { operator, value: value as never });

// Local midnight of 2026-10-20 as a stored ISO string: the UTC day differs in
// any zone east of Greenwich, which is what broke day-equality before.
const OCT20 = new Date(2026, 9, 20).toISOString();
const OCT21_NOON = new Date(2026, 9, 21, 12).toISOString();

const CELLS: unknown[] = [
  undefined, null, "", "Alpha", "alpha", "2", "10", "  ", 0, 2, 10, -1, Number.NaN,
  true, false, [], ["opt-a"], ["opt-a", "opt-b"], ["Alpha", "Beta"],
  OCT20, OCT21_NOON, "2026-10-20", new Date(2026, 9, 20, 15), new Date(Number.NaN),
  { start: OCT20, end: OCT21_NOON }, { weird: 1 },
];
const FILTER_VALUES: unknown[] = [
  "", "Alpha", "2", 2, 0, "opt-a", ["opt-a"], ["opt-b", "opt-c"], true, "true",
  "2026-10-20", "2026-10-21", { start: "2026-10-19", end: "2026-10-20" },
  { start: "", end: "2026-10-20" }, ["2026-10-19", "2026-10-21"], null,
];
const ALL_OPERATORS = [...new Set(Object.values(OPERATORS).flat().map(o => o.value))] as FilterOperator[];
const NEGATIONS: Array<[FilterOperator, FilterOperator]> = [
  ["equals", "not_equals"], ["contains", "not_contains"],
  ["is_empty", "is_not_empty"], ["is_checked", "is_not_checked"],
];

test("no operator throws on any cell × filter value combination", () => {
  let runs = 0;
  for (const op of ALL_OPERATORS) {
    for (const cell of CELLS) {
      for (const fv of FILTER_VALUES) {
        assert.equal(typeof match(cell, op, fv), "boolean", `${op} ${String(cell)} ${String(fv)}`);
        runs++;
      }
    }
  }
  assert.ok(runs > 5000, `ran ${runs} combinations`);
});

test("an operator and its negation never agree", () => {
  for (const [op, neg] of NEGATIONS) {
    for (const cell of CELLS) {
      for (const fv of FILTER_VALUES) {
        assert.notEqual(match(cell, op, fv), match(cell, neg, fv), `${op}/${neg} on ${JSON.stringify(cell)} vs ${JSON.stringify(fv)}`);
      }
    }
  }
});

test("numeric comparisons are a total order on numbers and numeric text", () => {
  const nums: unknown[] = [-1, 0, 2, "2", "10", 10, 3.5];
  for (const a of nums) {
    for (const b of nums) {
      assert.equal(match(a, "greater_than", b), !match(a, "less_than_or_equal", b), `${a} > ${b}`);
      assert.equal(match(a, "less_than", b), !match(a, "greater_than_or_equal", b), `${a} < ${b}`);
      assert.equal(match(a, "equals", b), Number(a) === Number(b), `${a} = ${b}`);
    }
  }
  // An empty or non-numeric cell satisfies no comparison (Notion hides it).
  for (const empty of [null, undefined, "", "abc", true, []]) {
    for (const op of ["greater_than", "less_than", "greater_than_or_equal", "less_than_or_equal"] as const) {
      assert.equal(match(empty, op, 0), false, `${op} on ${JSON.stringify(empty)}`);
    }
  }
});

test("date operators compare whole local days, whatever the stored shape", () => {
  // An epoch-ms NUMBER is a number cell, not a date: only date shapes here.
  for (const sameDay of [OCT20, "2026-10-20", new Date(2026, 9, 20, 23, 59)]) {
    assert.equal(match(sameDay, "equals", "2026-10-20"), true, `equals ${String(sameDay)}`);
    assert.equal(match(sameDay, "not_equals", "2026-10-20"), false);
    assert.equal(match(sameDay, "is_on_or_before", "2026-10-20"), true);
    assert.equal(match(sameDay, "is_on_or_after", "2026-10-20"), true);
    assert.equal(match(sameDay, "is_before", "2026-10-20"), false);
    assert.equal(match(sameDay, "is_after", "2026-10-19"), true);
  }
  const days = ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21"];
  for (const a of days) {
    for (const b of days) {
      assert.equal(match(a, "is_before", b), !match(a, "is_on_or_after", b));
      assert.equal(match(a, "is_after", b), !match(a, "is_on_or_before", b));
    }
  }
  assert.equal(match(null, "is_before", "2026-10-20"), false);
  assert.equal(match("not a date", "is_after", "2026-10-20"), false);
  assert.equal(localDay(new Date(Number.NaN)), null);
});

test("is_between takes {start,end} or [start,end]; a missing bound is open", () => {
  const range = { start: "2026-10-19", end: "2026-10-20" };
  assert.equal(match(OCT20, "is_between", range), true);
  assert.equal(match(OCT21_NOON, "is_between", range), false);
  assert.equal(match("2026-10-19", "is_between", ["2026-10-19", "2026-10-21"]), true);
  assert.equal(match("2026-01-01", "is_between", { start: "", end: "2026-10-20" }), true);
  assert.equal(match("2027-01-01", "is_between", { start: "2026-10-20", end: "" }), true);
  assert.equal(match("2026-01-01", "is_between", { start: "2026-10-20", end: "" }), false);
  assert.equal(match(OCT20, "is_between", { start: "", end: "" }), false);
  assert.equal(match(null, "is_between", range), false);
});

test("is_relative_to_today is the local calendar day", () => {
  const now = new Date();
  assert.equal(match(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 1).toISOString(), "is_relative_to_today"), true);
  assert.equal(match(new Date(now.getTime() - 86_400_000 * 2), "is_relative_to_today"), false);
});

test("multi-value cells: contains any picked option, equals any item", () => {
  assert.equal(match(["opt-a", "opt-b"], "contains", ["opt-b"]), true);
  assert.equal(match(["opt-a", "opt-b"], "contains", ["opt-c", "opt-a"]), true);
  assert.equal(match(["opt-a"], "contains", ["opt-c"]), false);
  assert.equal(match([], "contains", ["opt-a"]), false);
  assert.equal(match(["opt-a"], "not_contains", ["opt-a"]), false);
  assert.equal(match(["Alpha", "Beta"], "equals", "beta"), true);
  assert.equal(match("opt-a", "equals", ["opt-a", "opt-b"]), true, "select is-any-of");
});

test("text operators are case-insensitive", () => {
  assert.equal(match("Validated", "equals", "validated"), true);
  assert.equal(match("Validated", "contains", "LID"), true);
  assert.equal(match("Validated", "starts_with", "val"), true);
  assert.equal(match("Validated", "ends_with", "TED"), true);
  assert.equal(match(42, "starts_with", "4"), false, "starts_with is text-only");
});

test("checkbox and boolean formula cells", () => {
  assert.equal(match(true, "is_checked"), true);
  assert.equal(match(false, "is_checked"), false);
  assert.equal(match(undefined, "is_not_checked"), true);
  assert.equal(match(true, "equals", "true"), true, "a typed 'true' equals a boolean formula");
  assert.equal(match(false, "equals", "true"), false);
});

test("a filter waiting for its value is incomplete; valueless operators never are", () => {
  for (const op of ALL_OPERATORS) {
    if (VALUELESS_OPERATORS.has(op)) {
      assert.equal(isIncompleteFilter({ operator: op, value: "" as never }), false, op);
      assert.equal(needsValue(op), false, op);
    } else {
      assert.equal(needsValue(op), true, op);
      for (const empty of ["", null, undefined, [], { start: "", end: "" }]) {
        assert.equal(isIncompleteFilter({ operator: op, value: empty as never }), true, `${op} ${JSON.stringify(empty)}`);
      }
      assert.equal(isIncompleteFilter({ operator: op, value: 0 as never }), false, `${op} 0 is a value`);
      assert.equal(isIncompleteFilter({ operator: op, value: { start: "", end: "2026-10-20" } as never }), false);
    }
  }
});

test("computed and stored property types all offer operators", () => {
  for (const type of ["text", "number", "select", "multi_select", "status", "date", "due_date",
    "checkbox", "formula", "rollup", "relation", "created_time", "last_edited_time"]) {
    assert.ok((OPERATORS[type] ?? []).length > 0, `${type} has filter operators`);
  }
});

test("compareValues: empties last both ways, antisymmetric, direction flips", () => {
  const values: unknown[] = ["b", "a", "TR-10", "TR-2", 3, 1, 10, true, false,
    new Date(2026, 1, 1), new Date(2025, 1, 1), null, "", undefined, []];
  for (const a of values) {
    for (const b of values) {
      for (const dir of ["asc", "desc"] as const) {
        const ab = Math.sign(compareValues(a, b, dir));
        const ba = Math.sign(compareValues(b, a, dir));
        assert.ok(ab === -ba, `antisymmetric ${String(a)} ${String(b)} ${dir}`);
      }
    }
  }
  for (const dir of ["asc", "desc"] as const) {
    const sorted = [null, 3, "", 1, undefined, 2].sort((a, b) => compareValues(a, b, dir));
    assert.deepEqual(sorted.slice(0, 3), dir === "asc" ? [1, 2, 3] : [3, 2, 1]);
    assert.ok(sorted.slice(3).every(v => v === null || v === "" || v === undefined), `empties last ${dir}`);
  }
  assert.ok(compareValues("TR-2", "TR-10", "asc") < 0, "numeric collation");
  assert.ok(compareValues(new Date(2025, 0, 1), new Date(2026, 0, 1), "asc") < 0);
});

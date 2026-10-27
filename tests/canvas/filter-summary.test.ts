/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   filter-summary.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A filter chip reads as the rule it applies ("Name contains al"), not as the
// bare property name it used to show.

import assert from "node:assert/strict";
import test from "node:test";

import { filterSummary } from "../../src/shared/notion-database-sys/src/components/filters/filterSummary.ts";

const name = { id: "p1", name: "Name", type: "title" } as const;
const status = {
  id: "p2", name: "Status", type: "select",
  options: [{ id: "o1", value: "Done" }, { id: "o2", value: "Doing" }],
} as const;
const tags = {
  id: "p3", name: "Tags", type: "multi_select",
  options: [{ id: "t1", value: "Red" }, { id: "t2", value: "Blue" }],
} as const;

test("a text rule reads as the property, the operator and the value", () => {
  assert.equal(filterSummary(name, "contains", "al"), "Name contains al");
});

test("a rule without its value yet names only the property", () => {
  assert.equal(filterSummary(name, "contains", ""), "Name");
});

test("a rule that takes no value reads as its operator", () => {
  assert.equal(filterSummary(name, "is_empty", ""), "Name is empty");
  assert.equal(filterSummary({ id: "p4", name: "Done", type: "checkbox" }, "is_checked", ""), "Done is checked");
});

test("options show by name, never by id", () => {
  assert.equal(filterSummary(status, "equals", "o1"), "Status is Done");
  assert.equal(filterSummary(tags, "contains", ["t1", "t2"]), "Tags contains Red, Blue");
});

test("symbols keep their case and numbers print as typed", () => {
  assert.equal(filterSummary({ id: "p5", name: "Price", type: "number" }, "greater_than", 5), "Price > 5");
});

test("a date range shows both ends", () => {
  const due = { id: "p6", name: "Due", type: "date" } as const;
  assert.equal(filterSummary(due, "is_between", { start: "2026-01-01", end: "2026-01-31" }), "Due is between 2026-01-01 – 2026-01-31");
});

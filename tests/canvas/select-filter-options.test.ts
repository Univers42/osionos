/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   select-filter-options.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A select cell holds an option id in seeded databases but the option's text in
// `sys:` and workspace databases, while the filter UI stores the option id. A
// filter must match the same option whichever form either side carries.

import assert from "node:assert/strict";
import test from "node:test";

import { matchesPropertyFilter } from "../../src/shared/notion-database-sys/src/lib/filter/evaluateFilter.ts";
import { applyGlobalFilters } from "../../src/shared/notion-database-sys/src/hooks/useViewPages.ts";
import type { DashboardGlobalFilter, Filter, Page, SchemaProperty } from "../../src/shared/notion-database-sys/src/types/database.ts";

const STATUS: SchemaProperty = {
  id: "status", name: "Status", type: "select",
  options: [{ id: "opt-accepted", value: "accepted", color: "green" }, { id: "opt-pending", value: "pending", color: "gray" }],
};
const TAGS: SchemaProperty = {
  id: "tags", name: "Tags", type: "multi_select",
  options: [{ id: "t-a", value: "Alpha", color: "blue" }, { id: "t-b", value: "Beta", color: "red" }],
};
const filter = (operator: Filter["operator"], value: unknown, propertyId = "status"): Filter =>
  ({ id: "f", propertyId, operator, value } as Filter);

test("a text cell matches a filter on the option id, and the other way round", () => {
  assert.equal(matchesPropertyFilter("accepted", filter("equals", "opt-accepted"), STATUS), true);
  assert.equal(matchesPropertyFilter("opt-accepted", filter("equals", "accepted"), STATUS), true);
  assert.equal(matchesPropertyFilter("pending", filter("equals", "opt-accepted"), STATUS), false);
});

test("not equals agrees with equals whichever form each side holds", () => {
  assert.equal(matchesPropertyFilter("accepted", filter("not_equals", "opt-accepted"), STATUS), false);
  assert.equal(matchesPropertyFilter("pending", filter("not_equals", "opt-accepted"), STATUS), true);
});

test("a multi-select cell of labels matches a filter on an option id", () => {
  assert.equal(matchesPropertyFilter(["Alpha"], filter("contains", "t-a", "tags"), TAGS), true);
  assert.equal(matchesPropertyFilter(["Beta"], filter("contains", "t-a", "tags"), TAGS), false);
});

test("a column without options, or no column, compares as before", () => {
  const text: SchemaProperty = { id: "t", name: "T", type: "text" };
  assert.equal(matchesPropertyFilter("opt-accepted", filter("equals", "accepted", "t"), text), false);
  assert.equal(matchesPropertyFilter("accepted", filter("equals", "accepted", "t"), undefined), true);
});

test("a dashboard filter on a select keeps the rows that store the option's text", () => {
  const rows = [
    { id: "r1", properties: { status: "accepted" } },
    { id: "r2", properties: { status: "pending" } },
  ] as unknown as Page[];
  const filters = [{ id: "g", propertyName: "Status", propertyType: "select", operator: "equals", value: "accepted" }] as DashboardGlobalFilter[];
  assert.deepEqual(applyGlobalFilters(rows, filters, { status: STATUS }).map((row) => row.id), ["r1"]);
});

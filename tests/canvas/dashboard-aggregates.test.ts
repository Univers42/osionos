/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dashboard-aggregates.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 08:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 08:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregatePages,
  resolveStatValue,
  statKind,
  type AggProperty,
} from "../../src/shared/notion-database-sys/src/components/views/dashboard/dashboardAggregates.ts";
import type { DashboardWidget } from "../../src/shared/notion-database-sys/src/types/database.ts";

const FEATURED: AggProperty = { id: "featured", type: "checkbox", name: "Featured" };
const RETURNABLE: AggProperty = { id: "returnable", type: "checkbox", name: "Returnable" };
const PRICE: AggProperty = { id: "price", type: "number", name: "Price" };
const PROPS = [FEATURED, RETURNABLE, PRICE];

// 5 records: 1 featured, 4 returnable — the two checkbox columns disagree on purpose.
const PAGES = [
  { properties: { featured: true, returnable: true, price: 10 } },
  { properties: { featured: false, returnable: true, price: 20 } },
  { properties: { featured: false, returnable: true, price: 30 } },
  { properties: { featured: false, returnable: true } },
  { properties: { featured: false, returnable: false, price: "n/a" } },
];

function widget(over: Partial<DashboardWidget>): DashboardWidget {
  return { id: "w", type: "stat", title: "T", width: 1, height: 1, ...over };
}

test("checkbox columns are counted separately", () => {
  const data = aggregatePages(PAGES, PROPS);
  assert.deepEqual(data.checkboxCounts.featured, { checked: 1, unchecked: 4 });
  assert.deepEqual(data.checkboxCounts.returnable, { checked: 4, unchecked: 1 });
});

test("a count over a checkbox counts the checked records, not every record", () => {
  const data = { ...aggregatePages(PAGES, PROPS), recentCount: 0 };
  const stat = resolveStatValue(FEATURED as never, data, widget({ propertyId: "featured", aggregation: "count" }), PAGES.length);
  assert.equal(stat.value, 1);
  assert.equal(stat.subtext, "20% of 5 records");
});

test("number aggregates skip values that are not numbers", () => {
  const data = { ...aggregatePages(PAGES, PROPS), recentCount: 0 };
  const sum = resolveStatValue(PRICE as never, data, widget({ propertyId: "price", aggregation: "sum" }), PAGES.length);
  const avg = resolveStatValue(PRICE as never, data, widget({ propertyId: "price", aggregation: "average" }), PAGES.length);
  assert.equal(sum.value, 60);
  assert.equal(avg.value, 20);
  assert.equal(avg.subtext, "from 3 records");
});

test("no records gives zero, never Infinity", () => {
  const data = { ...aggregatePages([], PROPS), recentCount: 0 };
  assert.equal(resolveStatValue(FEATURED as never, data, widget({ propertyId: "featured", aggregation: "count" }), 0).value, 0);
  assert.equal(resolveStatValue(PRICE as never, data, widget({ propertyId: "price", aggregation: "min" }), 0).value, 0);
});

test("the icon follows what the tile measures, not its position", () => {
  assert.equal(statKind(null, widget({})), "count");
  assert.equal(statKind(FEATURED as never, widget({ propertyId: "featured", aggregation: "count" })), "checked");
  assert.equal(statKind(PRICE as never, widget({ propertyId: "price", aggregation: "sum" })), "sum");
  assert.equal(statKind(PRICE as never, widget({ propertyId: "price", aggregation: "average" })), "average");
});

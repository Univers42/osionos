/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dashboard-legacy-widgets.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Shipped dashboards used a fixed widget grid (`settings.widgets`) that no menu can
// build, and "Customize layout" emptied them. Each legacy widget must become a widget
// of the editable model (a KPI, a chart or a record list over the dashboard's own
// records) with nothing lost: same records, same numbers, same property, same order.

import assert from "node:assert/strict";
import { test } from "node:test";

import { legacyWidgetsToRows } from "@/shared/notion-database-sys/src/components/views/dashboard/notion/model/legacyWidgets";
import { getChartTypeDef } from "@/shared/notion-database-sys/src/lib/chart/chartTypeRegistry";
import type { DashboardWidget, SchemaProperty } from "@/shared/notion-database-sys/src/types/database";

const HOST = "v-prod-dashboard";

const PROPERTIES: Record<string, SchemaProperty> = {
  "pp-name": { id: "pp-name", name: "Name", type: "title" },
  "pp-category": { id: "pp-category", name: "Category", type: "select" },
  "pp-shipping": { id: "pp-shipping", name: "Shipping", type: "select" },
  "pp-condition": { id: "pp-condition", name: "Condition", type: "status" },
  "pp-price": { id: "pp-price", name: "Price", type: "number" },
  "pp-stock": { id: "pp-stock", name: "Stock", type: "number" },
  "pp-featured": { id: "pp-featured", name: "Featured", type: "checkbox" },
} as Record<string, SchemaProperty>;

// The Products "Overview Dashboard" seed (productSeedViews.ts), verbatim.
const OVERVIEW: DashboardWidget[] = [
  { id: "w1", type: "stat", title: "Total Products", aggregation: "count", width: 1, height: 1 },
  { id: "w2", type: "stat", title: "Avg Price", propertyId: "pp-price", aggregation: "average", width: 1, height: 1 },
  { id: "w3", type: "stat", title: "Catalog list value", propertyId: "pp-price", aggregation: "sum", width: 1, height: 1 },
  { id: "w4", type: "stat", title: "Featured", propertyId: "pp-featured", aggregation: "count", width: 1, height: 1 },
  { id: "w5", type: "chart", title: "Category Distribution", propertyId: "pp-category", chartStyle: "stacked_bar", aggregation: "count", width: 4, height: 1 },
  { id: "w6", type: "chart", title: "By Category", propertyId: "pp-category", chartStyle: "donut", aggregation: "count", width: 2, height: 2 },
  { id: "w7", type: "chart", title: "Shipping Methods", propertyId: "pp-shipping", chartStyle: "horizontal_bar", aggregation: "count", width: 2, height: 2 },
  { id: "w8", type: "chart", title: "Category Trends", propertyId: "pp-category", chartStyle: "multi_line", aggregation: "count", width: 4, height: 2 },
  { id: "w9", type: "table", title: "Top Products", propertyId: "pp-price", width: 2, height: 2 },
  { id: "w10", type: "list", title: "Recent Activity", width: 2, height: 2 },
];

const byTitle = (widgets: ReturnType<typeof legacyWidgetsToRows>["dashboardWidgets"], title: string) => {
  const found = widgets.filter((widget) => widget.title === title);
  assert.equal(found.length, 1, `exactly one widget titled ${title}`);
  return found[0];
};

test("every converted widget reads the dashboard's own records and keeps its title", () => {
  const { dashboardWidgets } = legacyWidgetsToRows(OVERVIEW, HOST, PROPERTIES);
  assert.equal(dashboardWidgets.length, OVERVIEW.length);
  for (const widget of dashboardWidgets) assert.equal(widget.viewId, HOST);
  assert.deepEqual(dashboardWidgets.map((widget) => widget.title), OVERVIEW.map((widget) => widget.title));
  assert.equal(new Set(dashboardWidgets.map((widget) => widget.id)).size, dashboardWidgets.length, "ids are unique");
});

test("stat widgets become KPI tiles with the same arithmetic as the legacy tile", () => {
  const { dashboardWidgets } = legacyWidgetsToRows(OVERVIEW, HOST, PROPERTIES);
  assert.deepEqual(byTitle(dashboardWidgets, "Total Products").stat, { fn: "count" });
  assert.deepEqual(byTitle(dashboardWidgets, "Avg Price").stat, { fn: "avg", propertyId: "pp-price" });
  assert.deepEqual(byTitle(dashboardWidgets, "Catalog list value").stat, { fn: "sum", propertyId: "pp-price" });
  // A count over a checkbox counted the checked records (dashboardAggregates.ts statKind).
  const featured = byTitle(dashboardWidgets, "Featured").stat;
  assert.equal(featured?.fn, "count");
  assert.equal(featured?.where?.length, 1);
  assert.equal(featured?.where?.[0]?.propertyId, "pp-featured");
  assert.equal(featured?.where?.[0]?.operator, "is_checked");
});

test("a count over a select counts its distinct values, as the legacy tile did", () => {
  const widgets: DashboardWidget[] = [
    { id: "s1", type: "stat", title: "Categories", propertyId: "pp-category", aggregation: "sum", width: 1, height: 1 },
  ];
  const [tile] = legacyWidgetsToRows(widgets, HOST, PROPERTIES).dashboardWidgets;
  assert.deepEqual(tile.stat, { fn: "distinct", propertyId: "pp-category" });
});

test("chart widgets become charts on the same property, with a registered chart type", () => {
  const { dashboardWidgets } = legacyWidgetsToRows(OVERVIEW, HOST, PROPERTIES);
  const expected: Record<string, string> = { "By Category": "donut", "Shipping Methods": "horizontal_bar" };
  for (const title of ["Category Distribution", "By Category", "Shipping Methods", "Category Trends"]) {
    const chart = byTitle(dashboardWidgets, title).chart;
    assert.ok(chart, `${title} is a chart`);
    assert.equal(getChartTypeDef(chart.chartType).id, chart.chartType, `${title}: ${chart.chartType} is a registered chart type`);
    assert.ok(chart.xAxisProperty === "pp-category" || chart.yAxisGroupBy === "pp-category" || chart.xAxisProperty === "pp-shipping",
      `${title} charts the legacy property`);
    if (expected[title]) assert.equal(chart.chartType, expected[title]);
  }
  const bar = legacyWidgetsToRows([{ id: "b", type: "chart", title: "Bars", propertyId: "pp-shipping", chartStyle: "bar", width: 2, height: 2 }], HOST, PROPERTIES);
  assert.equal(bar.dashboardWidgets[0].chart?.chartType, "vertical_bar");
});

test("a chart on a number property becomes its four figures as KPI tiles in one row", () => {
  const widgets: DashboardWidget[] = [
    { id: "a", type: "stat", title: "Products", aggregation: "count", width: 2, height: 1 },
    { id: "n", type: "chart", title: "Price Metrics", propertyId: "pp-price", chartStyle: "number_grid", aggregation: "sum", width: 2, height: 1 },
    { id: "z", type: "stat", title: "After", aggregation: "count", width: 1, height: 1 },
  ];
  const { dashboardWidgets, dashboardRows } = legacyWidgetsToRows(widgets, HOST, PROPERTIES);
  const figures = dashboardWidgets.filter((widget) => widget.stat?.propertyId === "pp-price");
  assert.deepEqual(figures.map((widget) => widget.stat?.fn).sort(), ["avg", "max", "min", "sum"]);
  const figureIds = new Set(figures.map((widget) => widget.id));
  const row = dashboardRows.find((candidate) => candidate.widgetIds.some((id) => figureIds.has(id)));
  assert.ok(row);
  assert.deepEqual(new Set(row.widgetIds), figureIds, "the four figures share a row of their own");
});

test("table and list widgets become record lists over the same records", () => {
  const { dashboardWidgets } = legacyWidgetsToRows(OVERVIEW, HOST, PROPERTIES);
  const top = byTitle(dashboardWidgets, "Top Products").records;
  assert.ok(top);
  assert.equal(top.sortPropertyId, "pp-price");
  assert.equal(top.showPropertyId, "pp-price");
  assert.equal(top.direction, "desc");
  assert.ok(top.limit >= 10);
  const recent = byTitle(dashboardWidgets, "Recent Activity").records;
  assert.ok(recent);
  assert.equal(recent.sortPropertyId, undefined, "no property = last edited first");
  assert.equal(recent.direction, "desc");
});

test("rows follow the legacy 4-column grid: order kept, widths sum to 1, tall rows are taller", () => {
  const { dashboardWidgets, dashboardRows } = legacyWidgetsToRows(OVERVIEW, HOST, PROPERTIES);
  const flat = dashboardRows.flatMap((row) => row.widgetIds);
  assert.deepEqual(flat, dashboardWidgets.map((widget) => widget.id), "every widget once, in order");
  for (const row of dashboardRows) {
    assert.ok(row.widgetIds.length >= 1 && row.widgetIds.length <= 4);
    assert.equal(row.widths.length, row.widgetIds.length);
    assert.ok(Math.abs(row.widths.reduce((sum, width) => sum + width, 0) - 1) < 1e-9);
  }
  // w1..w4 (width 1 each) fill the first row; w5 (width 4) is alone on the second.
  assert.equal(dashboardRows[0].widgetIds.length, 4);
  assert.equal(dashboardRows[1].widgetIds.length, 1);
  const shortRow = dashboardRows[0].height;
  const tallRow = dashboardRows[2].height; // w6 + w7, height 2
  assert.ok(tallRow > shortRow, "a height-2 row is taller than a height-1 row");
  assert.equal(new Set(dashboardRows.map((row) => row.id)).size, dashboardRows.length);
});

test("an empty widget list converts to an empty dashboard", () => {
  assert.deepEqual(legacyWidgetsToRows([], HOST, PROPERTIES), { dashboardWidgets: [], dashboardRows: [] });
});

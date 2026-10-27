/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dashboard-widget-entries.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// The picker and a widget's "…" menu list the same Chart and Records choices,
// so whatever one of them builds the other can rebuild.

import assert from "node:assert/strict";
import test from "node:test";

import { chartEntries, recordEntries, sortRecords } from "../../src/shared/notion-database-sys/src/components/views/dashboard/notion/model/widgetEntries.ts";
import type { Page, SchemaProperty } from "../../src/shared/notion-database-sys/src/types/database.ts";

const PROPERTIES: Record<string, SchemaProperty> = {
  title: { id: "title", name: "Name", type: "title" },
  status: { id: "status", name: "Status", type: "select" },
  due: { id: "due", name: "Due", type: "date" },
  created: { id: "created", name: "Created", type: "created_time" },
  points: { id: "points", name: "Points", type: "number" },
};

test("a chart per select and per date column, counted", () => {
  assert.deepEqual(chartEntries(PROPERTIES).map((entry) => entry.label), ["Chart · Status", "Chart · Due", "Chart · Created"]);
  assert.deepEqual(chartEntries(PROPERTIES)[0].chart, { chartType: "vertical_bar", xAxisProperty: "status", yAxisAggregation: "count" });
});

test("records: recently edited, top by a number, earliest and latest by a date", () => {
  const byLabel = Object.fromEntries(recordEntries(PROPERTIES).map((entry) => [entry.label, entry.records]));
  assert.deepEqual(byLabel["Recently edited"], { direction: "desc", limit: 10 });
  assert.deepEqual(byLabel["Top by Points"], { sortPropertyId: "points", direction: "desc", limit: 10, showPropertyId: "points" });
  assert.deepEqual(byLabel["Earliest Due"], { sortPropertyId: "due", direction: "asc", limit: 10, showPropertyId: "due" });
  assert.deepEqual(byLabel["Latest Created"], { sortPropertyId: "created", direction: "desc", limit: 10, showPropertyId: "created" });
});

test("a list of columns gives the same entries as the schema record", () => {
  assert.deepEqual(chartEntries(Object.values(PROPERTIES)), chartEntries(PROPERTIES));
  assert.deepEqual(recordEntries(Object.values(PROPERTIES)), recordEntries(PROPERTIES));
});

test("records sorted by a date keep the rows without one last", () => {
  const row = (id: string, due?: string) => ({ id, properties: { due }, updatedAt: "2026-10-01" }) as unknown as Page;
  const rows = [row("none"), row("late", "2026-11-02"), row("soon", "2026-10-28")];
  const read = (page: Page, propertyId: string) => page.properties[propertyId];
  assert.deepEqual(sortRecords(rows, { sortPropertyId: "due", direction: "asc", limit: 2 }, read).map((page) => page.id), ["soon", "late"]);
});

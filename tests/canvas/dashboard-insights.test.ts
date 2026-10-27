/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dashboard-insights.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { layoutFromSettings } from "@/shared/notion-database-sys/src/components/views/dashboard/notion/model/dashboardLayout.ts";
import { insightEntries } from "@/shared/notion-database-sys/src/components/views/dashboard/notion/model/insightEntries.ts";
import { numericFormulaColumns } from "@/shared/notion-database-sys/src/components/views/dashboard/notion/model/formulaInsightColumns.ts";
import { productViews } from "@/shared/notion-database-sys/src/store/dbms/hardcoded/productSeedViews.ts";
import { projectViews } from "@/shared/notion-database-sys/src/store/dbms/hardcoded/relationSeedViews.ts";
import type { SchemaProperty } from "@/shared/notion-database-sys/src/types/database";

test("formula analytics seed converts to one insight widget over the host view", () => {
  const view = productViews["v-prod-formula-dash"];
  const layout = layoutFromSettings(view.settings || {}, view.id);
  assert.equal(layout.rows.length, 1);
  assert.equal(layout.widgets.length, 1);
  assert.equal(layout.widgets[0].viewId, view.id);
  assert.equal(layout.widgets[0].insight, "formulas");
  assert.equal(layout.rows[0].widths[0], 1);
});

test("relation analytics seed converts to one insight widget over the host view", () => {
  const view = projectViews["v-proj-dashboard"];
  const layout = layoutFromSettings(view.settings || {}, view.id);
  assert.equal(layout.rows.length, 1);
  assert.equal(layout.widgets.length, 1);
  assert.equal(layout.widgets[0].viewId, view.id);
  assert.equal(layout.widgets[0].insight, "relations");
  assert.equal(layout.rows[0].widths[0], 1);
});

test("insight entries appear only when the schema has the columns", () => {
  const formulaOnly: Record<string, SchemaProperty> = {
    f: { id: "f", name: "F", type: "formula" } as SchemaProperty,
  };
  const relationOnly: Record<string, SchemaProperty> = {
    r: { id: "r", name: "R", type: "relation" } as SchemaProperty,
  };
  const rollupOnly: Record<string, SchemaProperty> = {
    u: { id: "u", name: "U", type: "rollup" } as SchemaProperty,
  };
  const none: Record<string, SchemaProperty> = {
    n: { id: "n", name: "N", type: "number" } as SchemaProperty,
  };
  assert.deepEqual(insightEntries(formulaOnly).map((e) => e.insight), ["formulas"]);
  assert.deepEqual(insightEntries(relationOnly).map((e) => e.insight), ["relations"]);
  assert.deepEqual(insightEntries(rollupOnly).map((e) => e.insight), ["relations"]);
  assert.deepEqual(insightEntries(none), []);
  assert.deepEqual(insightEntries([...Object.values(formulaOnly), ...Object.values(relationOnly)]).map((e) => e.label), ["Formula health", "Relations & rollups"]);
});

test("numeric formula list comes from the schema", () => {
  const properties: Record<string, SchemaProperty> = {
    a: { id: "a", name: "A", type: "formula", formulaConfig: { expression: "1" } } as SchemaProperty,
    b: { id: "b", name: "B", type: "formula", formulaConfig: { expression: "2" } } as SchemaProperty,
    c: { id: "c", name: "C", type: "formula", formulaConfig: { expression: "3" } } as SchemaProperty,
  };
  const analytics = {
    a: { resultType: "number" },
    b: { resultType: "number" },
    c: { resultType: "text" },
  } as any;
  assert.deepEqual(numericFormulaColumns(properties, analytics), ["a", "b"]);
  const emptyProps: Record<string, SchemaProperty> = {
    x: { id: "x", name: "X", type: "number" } as SchemaProperty,
  };
  assert.deepEqual(numericFormulaColumns(emptyProps, {}), []);
});
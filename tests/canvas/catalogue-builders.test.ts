/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   catalogue-builders.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Block } from "@/entities/block";
import { p } from "@/data/seedBlockHelpers";
import { dbInline } from "@/data/templates/templateBlocks";
import { twoSidebarsShell } from "@/data/templates/sections/shellSections";
import { planApply } from "@/features/templates/model/applyTemplate";
import type { DatabaseSlice, TemplateSource } from "@/features/templates/model/templateSlice";
import type { NotionState } from "@notion-db/object-database";
import { VIEW_TYPES } from "@notion-db/contract-types";
import { regionPage, scopeIds } from "../../src/data/templates/catalogue/builders/regions.ts";
import { view } from "../../src/data/templates/catalogue/builders/views.ts";
import { dashboardSettings, statTile, tileRow, viewTile } from "../../src/data/templates/catalogue/builders/cards.ts";
import { CATALOGUE_TIME, database, mergeSlices, record } from "../../src/data/templates/catalogue/builders/databases.ts";
import { listCatalogue, loadFrom, loadTemplate } from "../../src/data/templates/catalogue/index.ts";
import type { CatalogueCard } from "../../src/data/templates/catalogue/types.ts";

function cells(blocks: Block[]) {
  return blocks[0]?.layoutCells ?? [];
}

function shape(blocks: Block[]): unknown {
  return blocks.map((block) => ({
    type: block.type,
    content: block.content,
    layoutMode: block.layoutMode,
    cells: cells([block]).map((cell) => ({
      region: cell.region,
      blocks: cell.blocks.map((inner) => ({ type: inner.type, content: inner.content })),
    })),
  }));
}

function tiles(count: number) {
  return Array.from({ length: count }, (_, index) => viewTile(`w${index}`, "v", `Tile ${index}`));
}

function simpleSpec(databaseId: string, viewId: string, rowId: string) {
  return {
    id: databaseId,
    name: databaseId,
    properties: [{ id: "title", name: "Name", type: "title" as const }],
    views: [view(viewId, databaseId, "Table", "table")],
    rows: [record(rowId, databaseId, { title: rowId })],
  };
}

function simpleSlice(databaseId: string, viewId: string, rowId: string): DatabaseSlice {
  return database(simpleSpec(databaseId, viewId, rowId));
}

function exampleTemplate(): TemplateSource {
  const row = tileRow("row", [statTile("count", "v-table", "Tasks", "count"), viewTile("board", "v-board", "Board")]);
  const views = [
    view("v-table", "d", "Table", "table"),
    view("v-board", "d", "Board", "board"),
    view("v-dash", "d", "Dashboard", "dashboard", dashboardSettings([row])),
  ];
  return {
    id: "tpl:built", title: "Built",
    content: regionPage(twoSidebarsShell, { main: [dbInline("d", "v-dash")] }),
    databases: database({
      id: "d", name: "Tasks",
      properties: [{ id: "title", name: "Name", type: "title" }, { id: "score", name: "Score", type: "number" }],
      views, rows: [record("r1", "d", { title: "One", score: 1 }), record("r2", "d", { title: "Two", score: 2 })],
    }),
  };
}

function sequentialIds(): (prefix: string) => string {
  let next = 0;
  return (prefix) => `${prefix}-${++next}`;
}

test("regionPage fills only named non-empty regions and never mutates its shell", () => {
  const original = twoSidebarsShell();
  const before = shape(twoSidebarsShell());
  const replacement = [p("Filled")];
  const built = regionPage(() => original, { main: replacement, header: [] });
  assert.notEqual(built, original);
  assert.notEqual(built[0], original[0]);
  assert.deepEqual(shape(original), before);
  for (const cell of cells(built)) {
    if (cell.region === "main") assert.equal(cell.blocks, replacement);
    else assert.deepEqual(cell.blocks.map(({ type, content }) => ({ type, content })), [{ type: "paragraph", content: "" }]);
  }
});

test("regionPage adds no layoutCells key to a block that has none", () => {
  const [built] = regionPage(() => [p("Plain")], { main: [p("Filled")] });
  assert.equal(Object.hasOwn(built, "layoutCells"), false);
});

test("scopeIds re-ids blocks and cells depth-first and leaves its input untouched", () => {
  const nested = { ...p("Child") };
  const original = [{ ...p("Parent"), children: [nested] }, ...twoSidebarsShell()];
  const before = JSON.stringify(original);
  const scoped = scopeIds(original, "slug");
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual([scoped[0].id, scoped[0].children?.[0].id], ["slug-block-1", "slug-block-2"]);
  const cellIds = scoped[1].layoutCells?.map((cell) => cell.id) ?? [];
  assert.ok(cellIds.length >= 2);
  assert.deepEqual(cellIds, cellIds.map((_, n) => `slug-cell-${n + 1}`));
});

test("view builds all VIEW_TYPES with exactly the nine required keys", () => {
  for (const type of VIEW_TYPES) {
    assert.deepEqual(view("v", "d", "A view", type), {
      id: "v", databaseId: "d", name: "A view", type,
      filters: [], filterConjunction: "and", sorts: [], visibleProperties: [], settings: {},
    });
  }
  const settings = { showTitle: false };
  assert.equal(view("v", "d", "Custom", "table", settings).settings, settings);
});

test("tileRow gives one through four tiles equal widths summing to one", () => {
  for (let count = 1; count <= 4; count += 1) {
    const { row } = tileRow(`r${count}`, tiles(count));
    assert.equal(row.widths.length, count);
    assert.equal(row.height, 320);
    assert.ok(row.widths.every((width) => width === 1 / count));
    assert.ok(Math.abs(row.widths.reduce((sum, width) => sum + width, 0) - 1) <= 1e-9);
  }
});

test("tileRow rejects empty rows and rows above four tiles", () => {
  assert.throws(() => tileRow("empty", []), RangeError);
  assert.throws(() => tileRow("wide", tiles(5)), RangeError);
});

test("statTile sets only stat and viewTile sets no alternate presentation", () => {
  assert.deepEqual(statTile("s", "v", "Total", "sum", "amount"), {
    id: "s", viewId: "v", title: "Total", stat: { fn: "sum", propertyId: "amount" },
  });
  const embedded = viewTile("e", "v", "Embedded");
  for (const key of ["stat", "chart", "records"]) assert.equal(key in embedded, false);
});

test("dashboardSettings flattens widgets in row order and retains every reference", () => {
  const first = tileRow("r1", tiles(2));
  const second = tileRow("r2", [viewTile("last", "v", "Last")]);
  const settings = dashboardSettings([first, second]);
  assert.deepEqual(settings.dashboardRows?.map((row) => row.id), ["r1", "r2"]);
  assert.deepEqual(settings.dashboardWidgets?.map((widget) => widget.id), ["w0", "w1", "last"]);
  const ids = new Set(settings.dashboardWidgets?.map((widget) => widget.id));
  for (const row of settings.dashboardRows ?? []) {
    for (const widgetId of row.widgetIds) assert.ok(ids.has(widgetId));
  }
});

test("database chooses the title property and preserves view order", () => {
  const spec = simpleSpec("d", "v1", "r");
  spec.properties.push({ id: "second-title", name: "Second", type: "title" });
  spec.views.push(view("v2", "d", "Board", "board"));
  const built = database(spec);
  assert.equal(built.databases.d?.titlePropertyId, "title");
  assert.deepEqual(built.databases.d?.viewOrder, ["v1", "v2"]);
});

test("database rejects a missing title, foreign views and foreign rows", () => {
  const noTitle = simpleSpec("d", "v", "r");
  noTitle.properties = [{ id: "text", name: "Text", type: "text" }];
  assert.throws(() => database(noTitle), /title/);
  const foreignView = simpleSpec("d", "v", "r");
  foreignView.views[0]!.databaseId = "other";
  assert.throws(() => database(foreignView), /databaseId/);
  const foreignRow = simpleSpec("d", "v", "r");
  foreignRow.rows[0]!.databaseId = "other";
  assert.throws(() => database(foreignRow), /databaseId/);
});

test("mergeSlices merges disjoint slices and rejects duplicate view ids", () => {
  const merged = mergeSlices(simpleSlice("d1", "v1", "r1"), simpleSlice("d2", "v2", "r2"));
  assert.deepEqual(Object.keys(merged.databases).sort(), ["d1", "d2"]);
  assert.deepEqual(Object.keys(merged.views).sort(), ["v1", "v2"]);
  assert.deepEqual(Object.keys(merged.pages).sort(), ["r1", "r2"]);
  assert.throws(() => mergeSlices(simpleSlice("d1", "v", "r1"), simpleSlice("d2", "v", "r2")), /duplicate/);
});

test("mergeSlices rejects duplicate keys in every map, including __proto__", () => {
  const collisions: Array<[DatabaseSlice, DatabaseSlice]> = [
    [simpleSlice("__proto__", "v1", "r1"), simpleSlice("__proto__", "v2", "r2")],
    [simpleSlice("d1", "__proto__", "r1"), simpleSlice("d2", "__proto__", "r2")],
    [simpleSlice("d1", "v1", "__proto__"), simpleSlice("d2", "v2", "__proto__")],
  ];
  for (const [left, right] of collisions) assert.throws(() => mergeSlices(left, right), /duplicate/);
});

test("record stamps both timestamps with CATALOGUE_TIME", () => {
  assert.equal(CATALOGUE_TIME, "2026-11-20T00:00:00.000Z");
  const built = record("r", "d", { title: "Row" });
  assert.equal(built.createdAt, CATALOGUE_TIME);
  assert.equal(built.updatedAt, CATALOGUE_TIME);
  assert.deepEqual([built.createdBy, built.lastEditedBy, built.content], ["osionos", "osionos", []]);
});

test("the lazy catalogue lists cards and no unknown templates", async () => {
  assert.ok((await listCatalogue()).length >= 4);
  assert.equal(await loadTemplate("x"), null);
  assert.equal(await loadTemplate("tpl:none"), null);
});

test("loadFrom returns the fake entry source with identical content", async () => {
  const card: CatalogueCard = { id: "tpl:fake", title: "Fake", icon: "F", description: "Fake", category: "work" };
  const content: Block[] = [{ id: "b", type: "paragraph", content: "Body" }];
  const databases = simpleSlice("d", "v", "r");
  const entries: Parameters<typeof loadFrom>[0] = [{ card, load: async () => ({ ...card, content, databases }) }];
  const source = await loadFrom(entries, card.id);
  assert.ok(source);
  assert.deepEqual(source, { id: card.id, title: card.title, content, databases });
  assert.equal(source.content, content);
});

test("a built shell, three views and two records form an applicable template", () => {
  const live: NotionState = { databases: {}, views: {}, pages: {} };
  const target = { _id: "target", title: "Target", workspaceId: "ws", content: [] };
  const plan = planApply({
    target, template: exampleTemplate(), live, canEdit: true, dbWritable: true, mintId: sequentialIds(),
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.created.length, 1);
});

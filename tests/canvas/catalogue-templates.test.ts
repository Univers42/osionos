/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   catalogue-templates.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";

import type { Block } from "@/entities/block";
import type { TemplateSource } from "@/features/templates/model/templateSlice";
import type { DashboardViewWidget, NotionState, SchemaProperty, ViewConfig } from "@notion-db/contract-types";
import { VIEW_TYPES } from "@notion-db/contract-types";
import { attributeRoundTrip, blockDepth, fileRoundTrip, layoutProjection, markdownProjection, markdownRoundTrip } from "./support/catalogue-checks.ts";

const AUTH_STUB = `
globalThis.__sysAuth = { activeUserId: "u1", sessions: { u1: { accessToken: "t1" } } };
export const useUserStore = { getState: () => globalThis.__sysAuth, subscribe: () => () => {} };
`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (resolved.url.endsWith("/src/features/auth/index.ts")) {
      return { url: `data:text/javascript,${encodeURIComponent(AUTH_STUB)}`, shortCircuit: true };
    }
    return resolved;
  },
});

const { listCatalogue, loadTemplate } = await import("../../src/data/templates/catalogue/index.ts");
const { selectProperty } = await import("../../src/data/templates/catalogue/builders/options.ts");
const { planApply } = await import("../../src/features/templates/model/applyTemplate.ts");
const { COLLECTION_SLASH_ITEMS } = await import("../../src/shared/ui/assets/collectionSlashItems.ts");
const ENGINE = "../../src/shared/notion-database-sys/src/components/views/dashboard/notion/model";
const { statEntries } = await import(`${ENGINE}/statEntries.ts`);

const PROPERTY_TYPES = new Set(["title", "text", "number", "select", "multi_select", "date", "checkbox", "url"]);
const CATEGORIES = new Set(["work", "personal", "school", "team"]);
const LIVE: NotionState = { databases: {}, views: {}, pages: {} };

function slashTypes(): Set<string> {
  const types = new Set<string>(COLLECTION_SLASH_ITEMS.map((item: { type: string }) => item.type));
  const local = readFileSync(new URL("../../src/features/slash-commands/model/slashMenuCatalog.tsx", import.meta.url), "utf8");
  for (const match of local.matchAll(/blockType: "([a-z_0-9]+)"/g)) types.add(match[1]);
  return types;
}

const INSERTABLE = slashTypes();

function realRegions(blocks: Block[]): number {
  const cells = blocks.flatMap((block) => block.layoutCells ?? []);
  return cells.filter((cell) => {
    if (!cell.region || cell.blocks.length === 0) return false;
    const [only] = cell.blocks;
    return !(cell.blocks.length === 1 && only?.type === "paragraph" && only.content === "");
  }).length;
}

function verifyRoundTrips(blocks: Block[]): void {
  assert.ok(blockDepth(blocks) <= 8, `depth ${blockDepth(blocks)}`);
  assert.deepEqual(markdownProjection(markdownRoundTrip(blocks)), markdownProjection(blocks), "markdown");
  assert.deepEqual(fileRoundTrip(blocks), blocks, ".omd");
  assert.deepEqual(layoutProjection(attributeRoundTrip(blocks)), layoutProjection(blocks), "layout attributes");
}

function walkBlocks(blocks: Block[], visit: (block: Block, parent?: string) => void, parent?: string): void {
  for (const block of blocks) {
    visit(block, parent);
    walkBlocks(block.children ?? [], visit, block.type);
    for (const cell of block.layoutCells ?? []) walkBlocks(cell.blocks, visit, block.type);
  }
}

function verifyMenuAndReferences(template: TemplateSource): void {
  const count = Object.keys(template.databases.databases).length;
  assert.ok(count >= 1 && count <= 2, `${template.id} has 1–2 databases`);
  const referenced = new Set<string>();
  walkBlocks(template.content ?? [], (block, parent) => {
    if (block.type === "column") assert.equal(parent, "column_list", `${block.id} sits in columns`);
    else assert.ok(INSERTABLE.has(block.type), `${block.type} ${block.id} is in the / menu`);
    if (block.type === "database_inline" && block.databaseId) referenced.add(block.databaseId);
  });
  for (const id of Object.keys(template.databases.databases)) {
    assert.ok(referenced.has(id), `${id} is embedded in the page`);
  }
}

function verifySchemas(template: TemplateSource): void {
  for (const schema of Object.values(template.databases.databases)) {
    const rows = Object.values(template.databases.pages).filter((page) => page.databaseId === schema.id);
    assert.ok(rows.length >= 4 && rows.length <= 8, `${schema.id} has 4–8 rows`);
    for (const property of Object.values(schema.properties)) {
      assert.ok(PROPERTY_TYPES.has(property.type), `${schema.id}/${property.id} type ${property.type}`);
    }
  }
}

function verifyViews(template: TemplateSource): void {
  const validTypes = new Set<string>(VIEW_TYPES);
  const rich = Object.values(template.databases.databases).some((schema) => {
    const views = Object.values(template.databases.views).filter((view) => view.databaseId === schema.id);
    const types = new Set(views.map((view) => view.type));
    return types.size >= 3 && types.has("dashboard");
  });
  assert.ok(rich, "one database has three view types including a dashboard");
  for (const view of Object.values(template.databases.views)) {
    assert.ok(validTypes.has(view.type), `${view.id} type ${view.type}`);
    assert.ok(template.databases.databases[view.databaseId], `${view.id} has its database`);
  }
}

function verifyWidget(widget: DashboardViewWidget, properties: Record<string, SchemaProperty>): void {
  if (!widget.stat) return;
  const offers = statEntries(properties).map((offer) => offer.stat);
  assert.ok(offers.some((offer) => isDeepStrictEqual(offer, widget.stat)), `${widget.id} stat is a picker entry`);
}

function dashboardWidgets(view: ViewConfig, views: Record<string, ViewConfig>): DashboardViewWidget[] {
  for (const widget of view.settings.dashboardWidgets ?? []) {
    assert.ok(views[widget.viewId], `${widget.id} references an existing view`);
  }
  return view.settings.dashboardWidgets ?? [];
}

function verifyDashboards(template: TemplateSource): void {
  const dashboards = Object.values(template.databases.views).filter((view) => view.type === "dashboard");
  assert.ok(dashboards.length >= 1, "at least one dashboard view");
  for (const view of dashboards) {
    assert.ok((view.settings.dashboardRows?.length ?? 0) >= 1, `${view.id} has a row`);
    assert.ok((view.settings.dashboardWidgets?.length ?? 0) >= 1, `${view.id} has a widget`);
    const schema = template.databases.databases[view.databaseId];
    assert.ok(schema, `${view.id} has a schema`);
    for (const widget of dashboardWidgets(view, template.databases.views)) {
      assert.equal(template.databases.views[widget.viewId]?.databaseId, view.databaseId, `${widget.id} same database`);
      verifyWidget(widget, schema?.properties ?? {});
    }
  }
}

function allIds(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) allIds(item, found);
  else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value as Readonly<Record<string, unknown>>)) {
      if (key === "id" && typeof inner === "string") found.push(inner);
      allIds(inner, found);
    }
  }
  return found;
}

function verifyIdPrefixes(template: TemplateSource, slug: string): void {
  const ids = allIds({ content: template.content, databases: template.databases });
  for (const id of ids) assert.ok(id.startsWith(`${slug}-`), `${id} starts with ${slug}-`);
}

function applyRun(template: TemplateSource, run: string) {
  let next = 0;
  const target = { _id: `target-${run}`, title: "Target", workspaceId: "ws", content: [] };
  const mintId = (): string => `${run}-${++next}`;
  const plan = planApply({ target, template, live: LIVE, canEdit: true, dbWritable: true, mintId });
  assert.equal(plan.ok, true, `${template.id} run ${run}`);
  if (!plan.ok) throw new Error(plan.reason);
  return plan;
}

function verifyApply(template: TemplateSource): void {
  const first = applyRun(template, "a");
  const second = applyRun(template, "b");
  const expected = Object.keys(template.databases.databases).length;
  assert.equal(first.created.length, expected);
  assert.equal(second.created.length, expected);
  const secondIds = new Set(second.created.map((entry) => entry.id));
  const sliceIds = new Set(Object.keys(template.databases.databases));
  for (const entry of first.created) {
    assert.equal(secondIds.has(entry.id), false, `${entry.id} is not shared`);
    assert.equal(sliceIds.has(entry.id), false, `${entry.id} is fresh`);
  }
  for (const entry of second.created) assert.equal(sliceIds.has(entry.id), false, `${entry.id} is fresh`);
}

const CARDS = await listCatalogue();

test("catalogue cards have unique tpl ids, known categories and useful descriptions", () => {
  assert.ok(CARDS.length >= 4, "four templates are listed");
  assert.equal(new Set(CARDS.map((card) => card.id)).size, CARDS.length);
  for (const card of CARDS) {
    assert.ok(card.id.startsWith("tpl:"), card.id);
    assert.ok(CATEGORIES.has(card.category), `${card.id} category ${card.category}`);
    assert.ok(card.description.length >= 24, `${card.id} description`);
  }
});

test("the / menu accepts layout blocks used by catalogue shells", () => {
  assert.ok(INSERTABLE.has("layout"), "layout has an inline/full-page slash item");
});

for (const card of CARDS) {
  test(`catalogue ${card.id}: structure, round trips, widgets and isolated apply`, async (t) => {
    const template = await loadTemplate(card.id);
    assert.ok(template, `${card.id} loads`);
    if (!template) return;
    verifyIdPrefixes(template, card.id.slice(4));
    assert.ok((template.content?.length ?? 0) > 0);
    assert.ok(realRegions(template.content ?? []) >= 2, "two regions contain real blocks");
    verifyRoundTrips(template.content ?? []);
    verifyMenuAndReferences(template);
    verifySchemas(template);
    verifyViews(template);
    verifyDashboards(template);
    verifyApply(template);
    const bytes = Buffer.byteLength(JSON.stringify(template.databases));
    t.diagnostic(`BYTES ${card.id} ${bytes}`);
    assert.ok(bytes <= 32768, `${card.id} databases are ${bytes} bytes`);
  });
}

test("selectProperty builds select options from id, label and color tuples", () => {
  assert.deepEqual(selectProperty("status", "Status", [["opt-done", "Done", "green"]]), {
    id: "status", name: "Status", type: "select", options: [{ id: "opt-done", value: "Done", color: "green" }],
  });
});

test("selectProperty supports multi-select properties and empty options", () => {
  const built = selectProperty("channels", "Channels", [["web", "Website", "blue"]], "multi_select");
  assert.equal(built.type, "multi_select");
  assert.deepEqual(built.options?.map((option) => option.id), ["web"]);
  assert.deepEqual(selectProperty("empty", "Empty", []).options, []);
});

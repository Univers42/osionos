/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   db-computed-cells.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Formula, rollup and created-time columns store nothing in page.properties.
// These tests drive the REAL store slice and the REAL Rust engine over a
// tracker-shaped database and check that every reader (filter, sort, group,
// conditional color, chart, rollup) sees the computed value.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { before } from "node:test";
import { fileURLToPath } from "node:url";

import { initFormulaEngine, isWasmReady } from "../../src/shared/notion-database-sys/src/lib/engine/bridge.ts";
import { fromFormulaValue, toJsonValue } from "../../src/shared/notion-database-sys/src/lib/engine/bridgeTypes.ts";
import { createComputedSlice } from "../../src/shared/notion-database-sys/src/store/slices/computedSlice.ts";
import { withComputedCells } from "../../src/shared/notion-database-sys/src/store/slices/cellValues.ts";
import { formatFormulaResult } from "../../src/shared/notion-database-sys/src/store/slices/storeHelpers.ts";
import { nextIdNumber } from "../../src/shared/notion-database-sys/src/store/slices/pageSlice.ts";
import { colorForPage } from "../../src/shared/notion-database-sys/src/lib/conditionalColor.ts";
import { buildChartData } from "../../src/shared/notion-database-sys/src/lib/chart/chartEngine.ts";
import type { DatabaseSchema, Page, SchemaProperty, ViewConfig } from "../../src/shared/notion-database-sys/src/types/database.ts";

before(async () => {
  const originalFetch = globalThis.fetch;
  (globalThis as Record<string, unknown>).__OBJECT_DATABASE_DISABLE_WASM__ = false;
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    if (url.startsWith("file:")) {
      const bytes = await readFile(fileURLToPath(url));
      return new Response(bytes, { headers: { "content-type": "application/wasm" } });
    }
    return originalFetch(input as never);
  }) as typeof fetch;
  try {
    assert.equal(await initFormulaEngine(), true, "the formula engine must boot");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(isWasmReady(), true);
});

const prop = (id: string, name: string, type: SchemaProperty["type"], extra: Partial<SchemaProperty> = {}): SchemaProperty =>
  ({ id, name, type, ...extra });

const STATUS = prop("status", "Status", "select", { options: [
  { id: "st-todo", value: "To do", color: "gray" },
  { id: "st-wip", value: "In progress", color: "blue" },
  { id: "st-validated", value: "Validated", color: "green" },
] });
const TRACKER: DatabaseSchema = {
  id: "tracker", name: "Tracker", titlePropertyId: "title",
  properties: {
    title: prop("title", "Name", "title"),
    status: STATUS,
    points: prop("points", "Points", "number"),
    tags: prop("tags", "Tags", "multi_select", { options: [
      { id: "tg-web", value: "Web", color: "red" }, { id: "tg-ai", value: "AI", color: "blue" },
    ] }),
    due: prop("due", "Due", "date"),
    done: prop("done", "Done", "checkbox"),
    ref: prop("ref", "Ref", "id", { prefix: "TR-", autoIncrement: 3 }),
    earned: prop("earned", "Earned", "formula", { formulaConfig: { expression: 'if(prop("Status") == "Validated", prop("Points"), 0)' } }),
    double: prop("double", "Double", "formula", { formulaConfig: { expression: 'prop("Earned") * 2' } }),
    dueNext: prop("dueNext", "Due next", "formula", { formulaConfig: { expression: 'dateAdd(prop("Due"), 1, "days")' } }),
    parts: prop("parts", "Parts", "relation", { relationConfig: { databaseId: "parts" } as never }),
    partHours: prop("partHours", "Part hours", "rollup", { rollupConfig: { relationPropertyId: "parts", targetPropertyId: "hours", function: "sum" } }),
    partCount: prop("partCount", "Part count", "rollup", { rollupConfig: { relationPropertyId: "parts", targetPropertyId: "hours", function: "count" } }),
    partNames: prop("partNames", "Part names", "rollup", { rollupConfig: { relationPropertyId: "parts", targetPropertyId: "ptitle", function: "show_original" } }),
    load: prop("load", "Load", "formula", { formulaConfig: { expression: 'prop("Part hours") + prop("Points")' } }),
    cycA: prop("cycA", "Cyc A", "formula", { formulaConfig: { expression: 'prop("Cyc B") + 1' } }),
    cycB: prop("cycB", "Cyc B", "formula", { formulaConfig: { expression: 'prop("Cyc A") + 1' } }),
    created: prop("created", "Created", "created_time"),
  },
};
const PARTS: DatabaseSchema = {
  id: "parts", name: "Parts", titlePropertyId: "ptitle",
  properties: { ptitle: prop("ptitle", "Name", "title"), hours: prop("hours", "Hours", "number") },
};

const page = (id: string, databaseId: string, properties: Record<string, unknown>, createdAt: string, extra: Partial<Page> = {}): Page =>
  ({ id, databaseId, properties, content: [], createdAt, updatedAt: createdAt, createdBy: "u", lastEditedBy: "u", ...extra });

function freshPages(): Record<string, Page> {
  const list = [
    page("p1", "parts", { ptitle: "Lexer", hours: 3 }, "2026-01-01T00:00:00.000Z"),
    page("p2", "parts", { ptitle: "Parser", hours: 5 }, "2026-01-01T00:00:01.000Z"),
    page("p3", "parts", { ptitle: "Old", hours: 100 }, "2026-01-01T00:00:02.000Z", { archived: true }),
    page("a", "tracker", { title: "Auth", status: "st-validated", points: 2, tags: ["tg-web"], due: "2026-10-20", done: true, ref: "TR-2", parts: ["p1", "p2", "p3"] }, "2026-10-01T10:00:00.000Z"),
    page("b", "tracker", { title: "Chat", status: "st-wip", points: 1, tags: ["tg-web", "tg-ai"], ref: "TR-10", parts: ["p1"] }, "2026-10-02T10:00:00.000Z"),
    page("c", "tracker", { title: "LLM", status: "Validated", points: 1, tags: ["tg-ai"], due: "2026-10-25", ref: "TR-1" }, "2026-10-03T10:00:00.000Z"),
    page("d", "tracker", { title: "", ref: "TR-3" }, "2026-10-04T10:00:00.000Z"),
  ];
  return Object.fromEntries(list.map(p => [p.id, p]));
}

const view = (filters: ViewConfig["filters"] = [], sorts: ViewConfig["sorts"] = [], extra: Partial<ViewConfig> = {}): ViewConfig =>
  ({ id: "v", databaseId: "tracker", name: "T", type: "table", filters, filterConjunction: "and", sorts, visibleProperties: [], settings: {}, ...extra });

function makeStore(v: ViewConfig = view()) {
  const state: Record<string, unknown> = {
    databases: { tracker: TRACKER, parts: PARTS }, pages: freshPages(), views: { v }, searchQuery: "",
  };
  const get = () => state as never;
  Object.assign(state, createComputedSlice((() => {}) as never, get));
  return state as unknown as ReturnType<typeof createComputedSlice> & { pages: Record<string, Page>; views: Record<string, ViewConfig> };
}

const ids = (pages: Page[]) => pages.map(p => p.id);
const f = (propertyId: string, operator: string, value: unknown) => ({ id: `${propertyId}-${operator}`, propertyId, operator, value }) as never;

test("formulas read option labels, chain through formulas and rollups", () => {
  const s = makeStore();
  const cell = (id: string, propId: string) => s.getCellValue(s.pages[id], propId);
  assert.equal(cell("a", "earned"), 2, "option id resolves to its label");
  assert.equal(cell("c", "earned"), 1, "a label stored raw also matches");
  assert.equal(cell("b", "earned"), 0);
  assert.equal(cell("a", "double"), 4, "formula of formula");
  assert.equal(cell("a", "partHours"), 8, "archived related page excluded");
  assert.equal(cell("a", "partCount"), 2);
  assert.deepEqual(cell("a", "partNames"), ["Lexer", "Parser"]);
  assert.equal(cell("a", "load"), 10, "formula reading a rollup");
  assert.equal(cell("d", "partHours"), 0, "no relation → empty sum");
  assert.equal(cell("a", "created"), "2026-10-01T10:00:00.000Z");
  const next = cell("a", "dueNext");
  assert.equal(typeof next, "string");
  assert.equal(new Date(next as string).getTime() - new Date("2026-10-20").getTime(), 86_400_000, "date formula is a real date");
});

test("a formula cycle returns without overflowing the stack", () => {
  const s = makeStore();
  assert.doesNotThrow(() => s.getCellValue(s.pages.a, "cycA"));
});

test("resolveFormula evaluates drafts, empties and invalid expressions safely", () => {
  const s = makeStore();
  assert.equal(s.resolveFormula("tracker", s.pages.a, 'prop("Points") + 40'), 42);
  assert.equal(s.resolveFormula("tracker", s.pages.a, 'prop("Status")'), "Validated");
  assert.equal(s.resolveFormula("tracker", s.pages.a, ""), null);
  assert.notEqual(s.resolveFormula("tracker", s.pages.a, 'prop("Points" +'), 42, "invalid never yields a number");
  assert.doesNotThrow(() => s.resolveFormula("tracker", s.pages.d, 'prop("Missing") * 2'));
  assert.equal(s.resolveFormula("nope", s.pages.a, "1"), "#ERROR");
});

test("view filters on computed, select, multi-select and created columns", () => {
  const cases: Array<[ViewConfig, string[]]> = [
    [view([f("earned", "greater_than", 0)]), ["a", "c"]],
    [view([f("earned", "equals", 0)]), ["b", "d"]],
    [view([f("partHours", "greater_than_or_equal", 3)]), ["a", "b"]],
    // c stores the label "Validated": grouping, sorting and formulas read it as that option, so filters do too.
    [view([f("status", "equals", "st-validated")]), ["a", "c"]],
    [view([f("status", "not_equals", "st-validated")]), ["b", "d"]],
    [view([f("tags", "contains", ["tg-ai"])]), ["b", "c"]],
    [view([f("tags", "is_empty", "")]), ["d"]],
    [view([f("earned", "greater_than", "")]), ["a", "b", "c", "d"]],
    [view([f("deleted-prop", "equals", "x")]), ["a", "b", "c", "d"]],
    [view([f("earned", "equals", 2), f("tags", "contains", ["tg-ai"])], [], { filterConjunction: "or" }), ["a", "b", "c"]],
    [view([f("created", "is_on_or_after", "2026-10-03")]), ["c", "d"]],
    [view([f("done", "is_checked", "")]), ["a"]],
    [view([f("partNames", "contains", "pars")]), ["a"]],
  ];
  for (const [v, expected] of cases) {
    const s = makeStore(v);
    assert.deepEqual(ids(s.getPagesForView("v")).sort(), expected, JSON.stringify(v.filters));
  }
});

test("sorts: option order, formula desc with empties last, ID by number", () => {
  assert.deepEqual(ids(makeStore(view([], [{ id: "s", propertyId: "status", direction: "asc" }])).getPagesForView("v")),
    ["b", "a", "c", "d"], "To do < In progress < Validated; label-stored row sorts with its option; empty last");
  assert.deepEqual(ids(makeStore(view([], [{ id: "s", propertyId: "load", direction: "desc" }])).getPagesForView("v")),
    ["a", "b", "c", "d"]);
  assert.deepEqual(ids(makeStore(view([], [{ id: "s", propertyId: "ref", direction: "asc" }])).getPagesForView("v")),
    ["c", "a", "d", "b"], "TR-1 < TR-2 < TR-3 < TR-10");
  assert.deepEqual(ids(makeStore(view([], [{ id: "s", propertyId: "earned", direction: "desc" }, { id: "t", propertyId: "title", direction: "asc" }])).getPagesForView("v")),
    ["a", "c", "b", "d"], "multi-key sort");
});

test("grouping by a formula and by a select stored as label", () => {
  const byFormula = makeStore(view([], [], { grouping: { propertyId: "earned" } }));
  const groups = byFormula.getGroupedPages("v").map(g => [g.groupLabel, ids(g.pages).sort()]);
  assert.deepEqual(groups.sort(), [["0", ["b", "d"]], ["1", ["c"]], ["2", ["a"]]]);
  const bySelect = makeStore(view([], [], { grouping: { propertyId: "status" } }));
  const validated = bySelect.getGroupedPages("v").find(g => g.groupId === "st-validated");
  assert.deepEqual(ids(validated?.pages ?? []).sort(), ["a", "c"]);
});

test("a rollup follows its related page's edits (no stale cache)", () => {
  const s = makeStore(view([f("partHours", "greater_than", 10)]));
  assert.deepEqual(ids(s.getPagesForView("v")), []);
  s.pages = { ...s.pages, p1: { ...s.pages.p1, properties: { ...s.pages.p1.properties, hours: 30 } } };
  assert.equal(s.getCellValue(s.pages.a, "partHours"), 35);
  assert.deepEqual(ids(s.getPagesForView("v")).sort(), ["a", "b"]);
  s.pages = { ...s.pages, a: { ...s.pages.a, properties: { ...s.pages.a.properties, status: "st-todo" } } };
  assert.equal(s.getCellValue(s.pages.a, "earned"), 0, "formula follows its own row's edit");
});

test("conditional colors match computed columns and select labels", () => {
  const s = makeStore();
  const rules = [
    { id: "r0", propertyId: "earned", operator: "greater_than", value: "", color: "red" },
    { id: "r1", propertyId: "earned", operator: "greater_than", value: 1, color: "green" },
    { id: "r2", propertyId: "status", operator: "equals", value: "st-validated", color: "blue" },
  ] as never;
  const color = (id: string) => colorForPage(s.pages[id], rules, TRACKER.properties, s.getCellValue);
  assert.notEqual(color("a"), null, "earned 2 > 1");
  assert.equal(color("a"), colorForPage(s.pages.a, [rules[1]] as never, TRACKER.properties, s.getCellValue));
  assert.notEqual(color("c"), null, "label-stored Validated matches the option rule");
  assert.equal(color("b"), null);
  assert.equal(colorForPage(s.pages.a, [rules[1]] as never, TRACKER.properties), null, "without the reader a formula is empty");
});

test("charts aggregate computed columns once written into the rows", () => {
  const s = makeStore();
  const rows = withComputedCells(s.getPagesForView("v"), [STATUS, TRACKER.properties.earned], s.getCellValue);
  const result = buildChartData({ pages: rows, xProp: STATUS, yProp: TRACKER.properties.earned, aggregation: "sum" });
  const total = result.categories.reduce((sum, c) => sum + c.total, 0);
  assert.equal(total, 3, "2 + 0 + 1 + 0");
  const plain = s.getPagesForView("v");
  assert.equal(withComputedCells(plain, [STATUS], s.getCellValue), plain, "no computed column → same array");
});

test("the next ID never reuses a number already shown", () => {
  const pages = Object.values(freshPages());
  assert.equal(nextIdNumber(TRACKER.properties.ref, pages), 11);
  assert.equal(nextIdNumber({ ...TRACKER.properties.ref, autoIncrement: 50 }, pages), 50);
  assert.equal(nextIdNumber(prop("x", "X", "id"), []), 1);
  assert.equal(nextIdNumber({ ...TRACKER.properties.ref, prefix: "" }, [page("z", "tracker", { ref: "7" }, "")]), 8);
});

test("engine values round-trip and format for display", () => {
  const day = new Date(2026, 9, 20);
  for (const v of [3, "x", true, day, [1, "a", [true]], { start: day, end: new Date(2026, 9, 22) }]) {
    assert.deepEqual(fromFormulaValue(toJsonValue(v)), v, JSON.stringify(v));
  }
  assert.equal(fromFormulaValue({ type: "empty" }), "");
  assert.equal(formatFormulaResult(Math.PI), 3.14);
  assert.equal(formatFormulaResult(Number.NaN), undefined);
  assert.equal(formatFormulaResult(new Date(Number.NaN)), undefined);
  assert.equal(formatFormulaResult([day, "", 1]), `${formatFormulaResult(day)}, 1`);
  assert.equal(formatFormulaResult({ start: day, end: day }), `${formatFormulaResult(day)} → ${formatFormulaResult(day)}`);
});

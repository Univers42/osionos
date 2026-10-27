/**
 * "Ask AI" from a dashboard widget (h2-ask-everywhere, C419-C428): the text a
 * widget hands over is what it shows (a chart's groups, a records list's
 * sorted rows), ids stay out, the quote is capped, and the adapter exists only
 * with the AI service.
 */

import assert from "node:assert/strict";
import test from "node:test";

import "./support/memory-local-storage.ts";

import {
  SNAPSHOT_MAX_PROPERTIES, SNAPSHOT_MAX_RECORDS, chartMeasure, snapshotValue, widgetQuote, widgetSnapshot,
} from "../../src/shared/notion-database-sys/src/components/views/dashboard/notion/model/widgetSnapshot.ts";
import type { ChartResult } from "../../src/shared/notion-database-sys/src/lib/chart/chartTypes.ts";
import type { Page, SchemaProperty } from "../../src/shared/notion-database-sys/src/types/database.ts";
import { quoteForAssistant, useAssistantHandoff } from "@/features/chat/model/assistantHandoff";
import { dashboardAskAI } from "@/widgets/database-view/model/dashboardAskAi";

const properties: Record<string, SchemaProperty> = {
  name: { id: "name", name: "Name", type: "title" },
  stage: { id: "stage", name: "Stage", type: "select", options: [{ id: "s1", value: "Won", color: "green" }] },
  tags: { id: "tags", name: "Tags", type: "multi_select", options: [{ id: "t1", value: "VIP", color: "red" }, { id: "t2", value: "EU", color: "blue" }] },
  amount: { id: "amount", name: "Amount", type: "number" },
  owner: { id: "owner", name: "Owner", type: "person" },
  deal: { id: "deal", name: "Deal", type: "relation" },
  note: { id: "note", name: "Note", type: "text" },
  active: { id: "active", name: "Active", type: "checkbox" },
};

interface Row { title: string; values: Record<string, unknown> }
const row = (title: string, values: Record<string, unknown> = {}): Row => ({ title, values });
const snapshot = (records: Row[], visibleProperties = Object.keys(properties)) => widgetSnapshot({
  visibleProperties, properties, records, titleOf: (r) => r.title, valueOf: (r, id) => r.values[id],
});

test("the snapshot is the count, then each record's title and visible values in view order", () => {
  const text = snapshot([
    row("Acme", { stage: "s1", tags: ["t1", "t2"], amount: 1200, note: "first\ncall  done" }),
    row("", { amount: 0 }),
  ], ["name", "stage", "tags", "amount", "note"]);
  assert.equal(text, [
    "2 records",
    "- Acme — Stage: Won; Tags: VIP, EU; Amount: 1,200; Note: first call done",
    "- Untitled — Amount: 0",
  ].join("\n"));
  assert.equal(snapshot([row("Solo")], ["name"]), "1 record\n- Solo");
});

test("a checkbox reads yes or no, so an unchecked box is not dropped", () => {
  assert.equal(snapshot([row("On", { active: true }), row("Off", { active: false }), row("Unset")], ["active"]),
    "3 records\n- On — Active: yes\n- Off — Active: no\n- Unset — Active: no");
});

test("values that are ids (people, relations) and empty cells are left out", () => {
  const text = snapshot([row("Acme", { owner: "user-7f3a", deal: ["page-91"], note: "", stage: null })], ["owner", "deal", "note", "stage"]);
  assert.equal(text, "1 record\n- Acme");
  assert.equal(snapshotValue("user-7f3a", properties.owner), null);
  assert.equal(snapshotValue({ nested: true }, properties.note), null);
});

test("records and properties are capped, and the rest is counted", () => {
  const many = Array.from({ length: SNAPSHOT_MAX_RECORDS + 7 }, (_, i) => row(`Deal ${i}`, { amount: i }));
  const lines = snapshot(many).split("\n");
  assert.equal(lines.length, 1 + SNAPSHOT_MAX_RECORDS + 1);
  assert.equal(lines.at(-1), "… and 7 more");
  assert.equal(lines.includes(`- Deal ${SNAPSHOT_MAX_RECORDS} — Amount: ${SNAPSHOT_MAX_RECORDS}`), false);

  const wide: Record<string, SchemaProperty> = {};
  const values: Record<string, unknown> = {};
  for (let i = 0; i < SNAPSHOT_MAX_PROPERTIES + 3; i += 1) {
    wide[`p${i}`] = { id: `p${i}`, name: `P${i}`, type: "text" };
    values[`p${i}`] = `v${i}`;
  }
  const line = widgetSnapshot({ visibleProperties: Object.keys(wide), properties: wide, records: [row("x", values)], titleOf: (r) => r.title, valueOf: (r, id) => r.values[id] }).split("\n")[1];
  assert.equal(line.split("; ").length, SNAPSHOT_MAX_PROPERTIES);
});

const page = (title: string, values: Record<string, unknown> = {}): Page => ({
  id: title, databaseId: "db", properties: { name: title, ...values } as Page["properties"], content: [],
  createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z", createdBy: "u", lastEditedBy: "u",
});
const tasks: Record<string, SchemaProperty> = {
  name: { id: "name", name: "Name", type: "title" },
  due: { id: "due", name: "Due", type: "date" },
  note: { id: "note", name: "Note", type: "text" },
};
const quoteOf = (widget: Parameters<typeof widgetQuote>[0]["widget"], pages: Page[], chartResult: ChartResult | null = null) => widgetQuote({
  widget, view: { visibleProperties: ["name", "due", "note"], settings: {} }, properties: { ...properties, ...tasks }, pages, chartResult,
  titleOf: (p) => String(p.properties.name ?? ""), valueOf: (p, id) => p.properties[id],
});

test("a records widget quotes the rows it draws: sorted by its column, cut at its limit, with its one shown value", () => {
  const pages = [
    page("Undated", { note: "later" }),
    page("Plan", { due: "2026-07-14", note: "x" }),
    page("Fix", { due: "2026-07-11", note: "y" }),
    page("Publish", { due: "2026-07-19" }),
    page("Review", { due: "2026-07-12" }),
  ];
  assert.equal(quoteOf({ records: { sortPropertyId: "due", direction: "asc", limit: 3, showPropertyId: "due" } }, pages), [
    "3 of 5 records",
    "- Fix — Due: Jul 11, 2026",
    "- Review — Due: Jul 12, 2026",
    "- Plan — Due: Jul 14, 2026",
  ].join("\n"));
  // No shown column: titles only, as the widget draws them.
  assert.equal(quoteOf({ records: { sortPropertyId: "due", direction: "desc", limit: 10 } }, pages.slice(1, 3)), "2 records\n- Plan\n- Fix");
});

test("a chart widget quotes the groups it drew, not the records behind them", () => {
  const drawn: ChartResult = {
    categories: [
      { key: "s1", label: "Won", color: "", values: { a: 2, b: 1 }, pageIds: {}, total: 3 },
      { key: "s2", label: "", color: "", values: { a: 0.333 }, pageIds: {}, total: 0.333 },
    ],
    series: [{ key: "a", label: "VIP", color: "" }, { key: "b", label: "EU", color: "" }],
    total: 3.333, truncatedGroups: false, truncatedSeries: false,
  };
  const chart = { chartType: "vertical_bar", xAxisProperty: "stage", yAxisProperty: "amount", yAxisAggregation: "average" as const, yAxisGroupBy: "tags" };
  assert.equal(quoteOf({ chart }, [page("Acme")], drawn), [
    "Average of Amount by Stage, split by Tags",
    "- Won: 3 (VIP 2, EU 1)",
    "- Empty: 0.33 (VIP 0.33)",
  ].join("\n"));
  assert.equal(quoteOf({ chart: { chartType: "donut", xAxisProperty: "stage" } }, [page("Acme")]), "Count of records by Stage\nNo data");
});

test("a chart's measure follows the engine: no value counts records, a value sums by default", () => {
  assert.equal(chartMeasure({ xAxisProperty: "stage" }, properties), "Count of records by Stage");
  assert.equal(chartMeasure({ xAxisProperty: "stage", yAxisProperty: "amount", yAxisCumulative: true }, properties), "Sum of Amount by Stage, running total");
});

test("an embedded view quotes its records and visible values, as before", () => {
  assert.equal(quoteOf({}, [page("Fix", { due: "2026-07-11", note: "y" })]), "1 record\n- Fix — Due: Jul 11, 2026; Note: y");
});

test("C424 without the AI service there is no adapter, so the kit draws no button", () => {
  assert.equal(dashboardAskAI(false), undefined);
});

test("C419 C421 C425 the adapter hands the quote under the widget's title, with no page and nothing sent", () => {
  const onAskAI = dashboardAskAI(true);
  assert.ok(onAskAI);
  useAssistantHandoff.getState().handOff({ attachments: [], text: "an older hand-off" });
  onAskAI({ title: "Open deals", text: "2 records\n- Acme" });
  assert.deepEqual(useAssistantHandoff.getState().take(), {
    attachments: [],
    text: quoteForAssistant([{ author: "Open deals", text: "2 records\n- Acme" }]),
  });
});

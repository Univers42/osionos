/* ************************************************************************** */
/*  ai-builder-kit-slice.test.ts — the kit accepts a database built from an   */
/*  AI plan (devil P6 U1). kitSliceOf is a service module with LOCAL copies   */
/*  of the kit types; this test is what keeps those copies honest.            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { NotionState } from "@notion-db/object-database";
import { createComputedSlice } from "../../src/shared/notion-database-sys/src/store/slices/computedSlice.ts";
import { withServerSlice } from "../../src/widgets/database-view/model/objectDatabaseSlice.ts";
import { kitSliceOf, rowUuid } from "../../services/osionos-ai/src/builders/kitSlice.ts";
import {
  PLAN_PROPERTY_TYPES,
  PLAN_VIEW_TYPES,
  type PlanDatabaseItem,
} from "../../services/osionos-ai/src/builders/planSchema.ts";

const DB_KEY = "db-0123456789abcdef01234567";
const CTX = { userId: "user-1", now: "2026-10-23T00:00:00.000Z" };
const FORBIDDEN = ["formulaConfig", "rollupConfig", "relationConfig", "buttonConfig", "customConfig"];

const plan: PlanDatabaseItem = {
  kind: "database",
  key: "deals",
  dbKey: DB_KEY,
  title: "Deals",
  properties: [
    { name: "Name", type: "title" },
    { name: "Notes", type: "text" },
    { name: "Amount", type: "number" },
    { name: "Stage", type: "select", options: ["Open", "Won", "Lost"] },
    { name: "Tags", type: "multi_select", options: ["a", "b"] },
    { name: "State", type: "status", options: ["Not started", "Review", "Done"] },
    { name: "Due", type: "date" },
    { name: "Paid", type: "checkbox" },
    { name: "Site", type: "url" },
    { name: "Mail", type: "email" },
    { name: "Phone", type: "phone" },
  ],
  // One view of every allowed type; the chart and the dashboard carry the settings they need to draw.
  views: PLAN_VIEW_TYPES.map((type): PlanDatabaseItem["views"][number] => {
    if (type === "chart") return { type, name: "V chart", chartType: "vertical_bar", xAxis: "Stage", aggregation: "sum", yAxis: "Amount" };
    if (type === "dashboard") {
      return { type, name: "V dashboard", cells: [{ view: "V table" }, { view: "V chart", stat: { fn: "sum", property: "Amount" } }] };
    }
    return { type, name: `V ${type}` };
  }),
  rows: [
    { values: { Name: "Acme", Amount: 10, Stage: "Open", Tags: "a, b", State: "Review", Due: "2026-11-01", Paid: true, Site: "https://a.test" } },
    { values: { Name: "Bolt", Stage: "Won", Due: "2026-11-02", Amount: "not a number" } },
    { values: { Name: "Cove", Stage: "Nope" } },
  ],
};

/** A kit store's read side over one state: the kit's own computed slice. */
function readSide(state: NotionState) {
  const self: Record<string, unknown> = { ...state, searchQuery: "" };
  const slice = createComputedSlice(() => undefined, () => self as never);
  Object.assign(self, slice);
  return slice;
}

const emptyState = (): NotionState => ({ databases: {}, pages: {}, views: {} }) as NotionState;
const viewIdOf = (state: NotionState, type: string) => Object.values(state.views).find((view) => view.type === type)!.id;

test("the plan covers every allowed property type", () => {
  assert.deepEqual(new Set(plan.properties.map((property) => property.type)), new Set(PLAN_PROPERTY_TYPES));
});

test("the output is a NotionState and the app's load puts the database, 3 pages and every view in place", () => {
  const { state: slice } = kitSliceOf(plan, CTX);
  const state: NotionState = slice;
  const loaded = withServerSlice(emptyState(), DB_KEY, state);
  assert.deepEqual(Object.keys(loaded.databases), [DB_KEY]);
  assert.equal(Object.keys(loaded.pages).length, 3);
  assert.equal(Object.keys(loaded.views).length, PLAN_VIEW_TYPES.length);
});

test("the kit's own selectors read the table, the board and the calendar", () => {
  const loaded = withServerSlice(emptyState(), DB_KEY, kitSliceOf(plan, CTX).state);
  const read = readSide(loaded);

  const rows = read.getPagesForView(viewIdOf(loaded, "table"));
  assert.deepEqual(rows.map((page) => read.getPageTitle(page)), ["Acme", "Bolt", "Cove"]);

  const groups = read.getGroupedPages(viewIdOf(loaded, "board"));
  const stage = Object.values(loaded.databases[DB_KEY]!.properties).find((property) => property.name === "Stage")!;
  assert.deepEqual(
    groups.filter((group) => group.groupId !== "__unassigned__").map((group) => group.groupLabel),
    ["Open", "Won", "Lost"],
  );
  assert.deepEqual(groups.find((group) => group.groupLabel === "Open")!.pages.map((page) => page.properties[stage.id]), [stage.options![0]!.id]);
  assert.equal(groups.find((group) => group.groupLabel === "Won")!.pages.length, 1);
  assert.equal(groups.find((group) => group.groupId === "__unassigned__")!.pages.length, 1, "an unknown option is dropped, not invented");

  const calendar = loaded.views[viewIdOf(loaded, "calendar")]!;
  const dated = read.getPagesForView(calendar.id).filter((page) => page.properties[calendar.settings.showCalendarBy!]);
  assert.deepEqual(dated.map((page) => page.properties[calendar.settings.showCalendarBy!]), ["2026-11-01", "2026-11-02"]);
});

test("after the app's load, the chart's axes are properties and every dashboard widget is a view of the same database", () => {
  const loaded = withServerSlice(emptyState(), DB_KEY, kitSliceOf(plan, CTX).state);
  const props = loaded.databases[DB_KEY]!.properties;
  const chart = loaded.views[viewIdOf(loaded, "chart")]!;
  assert.equal(props[chart.settings.xAxisProperty!]?.name, "Stage");
  assert.equal(props[chart.settings.yAxisProperty!]?.name, "Amount");
  assert.equal(chart.settings.yAxisAggregation, "sum");

  const dashboard = loaded.views[viewIdOf(loaded, "dashboard")]!;
  const widgets = dashboard.settings.dashboardWidgets ?? [];
  assert.deepEqual(widgets.map((widget) => loaded.views[widget.viewId]?.name), ["V table", "V chart"]);
  for (const widget of widgets) assert.equal(loaded.views[widget.viewId]!.databaseId, DB_KEY);
  assert.deepEqual(dashboard.settings.dashboardRows?.flatMap((row) => row.widgetIds), widgets.map((widget) => widget.id));
});

test("values are typed; a value that does not fit is dropped; the status has its three groups", () => {
  const { state } = kitSliceOf(plan, CTX);
  const props = state.databases[DB_KEY]!.properties;
  const id = (name: string) => Object.values(props).find((property) => property.name === name)!.id;
  const [acme, bolt] = Object.values(state.pages);
  assert.equal(acme!.properties[id("Amount")], 10);
  assert.equal(acme!.properties[id("Paid")], true);
  assert.deepEqual(acme!.properties[id("Tags")], [`${id("Tags")}-o0`, `${id("Tags")}-o1`]);
  assert.equal(bolt!.properties[id("Amount")], undefined);
  const groups = props[id("State")]!.statusGroups!;
  assert.deepEqual(groups.map((group) => group.label), ["To-do", "In Progress", "Complete"]);
  assert.deepEqual(groups.map((group) => group.optionIds.length), [2, 0, 1]);
});

test("two calls give byte-identical JSON; row ids are v4-shaped and distinct", () => {
  assert.equal(JSON.stringify(kitSliceOf(plan, CTX)), JSON.stringify(kitSliceOf(plan, CTX)));
  const ids = [0, 1, 2].map((i) => rowUuid(DB_KEY, i));
  assert.equal(new Set(ids).size, 3);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("no executable config key appears anywhere in the JSON", () => {
  const json = JSON.stringify(kitSliceOf(plan, CTX));
  for (const key of FORBIDDEN) assert.equal(json.includes(key), false, key);
});

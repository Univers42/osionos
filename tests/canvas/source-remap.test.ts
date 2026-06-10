/* ************************************************************************** */
/*  source-remap.test.ts — pure view rebinding (Source picker, Phase 1)      */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPropertyMap, remapViewToSource,
} from "../../src/shared/notion-database-sys/src/lib/sourceRemap.ts";
import type {
  DatabaseSchema, ViewConfig,
} from "../../src/shared/notion-database-sys/src/component/types.ts";

function db(id: string, props: [string, string, string][]): DatabaseSchema {
  const properties = Object.fromEntries(props.map(([pid, name, type]) => [
    pid, { id: pid, name, type: type as DatabaseSchema["properties"][string]["type"] },
  ]));
  return { id, name: id, properties, titlePropertyId: props[0][0] };
}

function view(databaseId: string, overrides: Partial<ViewConfig> = {}): ViewConfig {
  return {
    id: "v1", databaseId, name: "Test", type: "table",
    filters: [], filterConjunction: "and", sorts: [],
    visibleProperties: [], settings: {},
    ...overrides,
  };
}

const OLD = db("old", [
  ["o-title", "Name", "title"],
  ["o-status", "Status", "select"],
  ["o-total", "Total", "number"],
  ["o-due", "Due", "date"],
]);
const NEW = db("new", [
  ["n-title", "Name", "text"],          // name match, compatible family
  ["o-status", "Status", "select"],     // exact id survives
  ["n-status2", "Status", "status"],    // would also match by name — id wins
  ["n-amount", "Amount", "number"],     // no counterpart for Total
  ["n-due", "due", "created_time"],     // case-insensitive name, date family
]);

test("source-remap: id match wins over name match", () => {
  const map = buildPropertyMap(OLD, NEW);
  assert.equal(map["o-status"], "o-status");
});

test("source-remap: name match requires a compatible type family", () => {
  const map = buildPropertyMap(OLD, NEW);
  assert.equal(map["o-title"], "n-title");     // title→text OK
  assert.equal(map["o-due"], "n-due");         // date→created_time OK
  assert.equal(map["o-total"], undefined);     // Total has no counterpart
});

test("source-remap: filters and sorts are remapped or dropped", () => {
  const remapped = remapViewToSource(view("old", {
    filters: [
      { id: "f1", propertyId: "o-status", operator: "equals", value: "x" },
      { id: "f2", propertyId: "o-total", operator: "greater_than", value: 5 },
    ],
    sorts: [
      { id: "s1", propertyId: "o-due", direction: "asc" },
      { id: "s2", propertyId: "o-total", direction: "desc" },
    ],
  }), OLD, NEW);
  assert.equal(remapped.databaseId, "new");
  assert.deepEqual(remapped.filters.map(f => f.propertyId), ["o-status"]);
  assert.deepEqual(remapped.sorts.map(s => s.propertyId), ["n-due"]);
});

test("source-remap: settings property refs are remapped, dead ones cleared", () => {
  const remapped = remapViewToSource(view("old", {
    settings: {
      xAxisProperty: "o-status",
      yAxisProperty: "o-total",
      showTimelineBy: "o-due",
      hiddenGroups: ["a"],
      manualGroupOrder: ["a", "b"],
      chartHeight: "large",
    },
  }), OLD, NEW);
  assert.equal(remapped.settings.xAxisProperty, "o-status");
  assert.equal(remapped.settings.yAxisProperty, undefined);
  assert.equal(remapped.settings.showTimelineBy, "n-due");
  // x axis survived → group bookkeeping survives
  assert.deepEqual(remapped.settings.hiddenGroups, ["a"]);
  assert.equal(remapped.settings.chartHeight, "large");
});

test("source-remap: group bookkeeping clears when the x property dies", () => {
  const remapped = remapViewToSource(view("old", {
    settings: { xAxisProperty: "o-total", hiddenGroups: ["a"], manualGroupOrder: ["a"] },
  }), OLD, NEW);
  assert.equal(remapped.settings.xAxisProperty, undefined);
  assert.equal(remapped.settings.hiddenGroups, undefined);
  assert.equal(remapped.settings.manualGroupOrder, undefined);
});

test("source-remap: grouping/visibleProperties fall back sensibly", () => {
  const remapped = remapViewToSource(view("old", {
    grouping: { propertyId: "o-total" },
    visibleProperties: ["o-total"],
  }), OLD, NEW);
  assert.equal(remapped.grouping, undefined);
  // nothing mapped → expose every property of the new database
  assert.deepEqual(remapped.visibleProperties, Object.keys(NEW.properties));
});

test("source-remap: null old database keeps view shape, rebinding only", () => {
  const remapped = remapViewToSource(view("missing", {
    filters: [{ id: "f1", propertyId: "ghost", operator: "equals", value: 1 }],
    visibleProperties: ["ghost"],
  }), null, NEW);
  assert.equal(remapped.databaseId, "new");
  assert.deepEqual(remapped.filters, []);
  assert.deepEqual(remapped.visibleProperties, Object.keys(NEW.properties));
});

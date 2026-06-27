/* ************************************************************************** */
/*  chart-engine-series.test.ts — breakdown series, caps, visibility, order  */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { buildChartData } from "../../src/shared/notion-database-sys/src/lib/chart/chartEngine.ts";
import { toRechartsRows } from "../../src/shared/notion-database-sys/src/lib/chart/chartEngine.ts";
import {
  MAX_GROUPS, MAX_SUBGROUPS, OVERFLOW_KEY,
} from "../../src/shared/notion-database-sys/src/lib/chart/chartTypes.ts";
import type { ChartEngineInput, ChartPageLike } from "../../src/shared/notion-database-sys/src/lib/chart/chartTypes.ts";
import type { SchemaProperty } from "../../src/shared/notion-database-sys/packages/contract-types/src/index.ts";

const regionProp: SchemaProperty = {
  id: "region", name: "Region", type: "select",
  options: [
    { id: "eu", value: "EU", color: "blue" },
    { id: "us", value: "US", color: "red" },
  ],
};
const tierProp: SchemaProperty = {
  id: "tier", name: "Tier", type: "select",
  options: [
    { id: "free", value: "Free", color: "gray" },
    { id: "pro", value: "Pro", color: "gold" },
  ],
};
const cityProp: SchemaProperty = { id: "city", name: "City", type: "text" };

function page(id: string, props: Record<string, unknown>): ChartPageLike {
  return { id, properties: props as ChartPageLike["properties"] };
}

function input(over: Partial<ChartEngineInput>): ChartEngineInput {
  return { pages: [], xProp: regionProp, aggregation: "count", ...over };
}

test("chart-series: breakdown produces a stacked matrix", () => {
  const pages = [
    page("p1", { region: "eu", tier: "free" }),
    page("p2", { region: "eu", tier: "pro" }),
    page("p3", { region: "eu", tier: "pro" }),
    page("p4", { region: "us", tier: "free" }),
  ];
  const result = buildChartData(input({ pages, groupByProp: tierProp }));
  assert.deepEqual(result.series.map(s => s.key).sort(), ["free", "pro"]);
  const eu = result.categories.find(c => c.key === "eu");
  assert.equal(eu?.values.free, 1);
  assert.equal(eu?.values.pro, 2);
  assert.equal(eu?.total, 3);
  const rows = toRechartsRows(result);
  const euRow = rows.find(r => r.key === "eu");
  assert.equal(euRow?.free, 1);
  assert.equal(euRow?.pro, 2);
  // US row has explicit 0 for missing series (recharts stacking needs it)
  const usRow = rows.find(r => r.key === "us");
  assert.equal(usRow?.pro, 0);
});

test("chart-series: >200 groups fold into Other with truncation flag", () => {
  const pages = Array.from({ length: 260 }, (_, i) =>
    page(`p${i}`, { city: `City-${String(i).padStart(3, "0")}` }));
  const result = buildChartData(input({ pages, xProp: cityProp }));
  assert.equal(result.truncatedGroups, true);
  assert.equal(result.categories.length, MAX_GROUPS);
  const other = result.categories.find(c => c.key === OVERFLOW_KEY);
  assert.ok(other);
  // 260 - (200 - 1 kept) = 61 folded pages
  assert.equal(other.total, 61);
  assert.equal(result.total, 260); // grand total preserved
});

test("chart-series: >50 subgroups fold into an Other series", () => {
  const pages = Array.from({ length: 80 }, (_, i) =>
    page(`p${i}`, { region: "eu", city: `City-${String(i).padStart(2, "0")}` }));
  const result = buildChartData(input({ pages, groupByProp: cityProp }));
  assert.equal(result.truncatedSeries, true);
  assert.equal(result.series.length, MAX_SUBGROUPS);
  const eu = result.categories.find(c => c.key === "eu");
  assert.equal(eu?.values[OVERFLOW_KEY], 80 - (MAX_SUBGROUPS - 1));
  assert.equal(eu?.total, 80);
});

test("chart-series: hiddenGroups removes series in breakdown mode", () => {
  const pages = [
    page("p1", { region: "eu", tier: "free" }),
    page("p2", { region: "eu", tier: "pro" }),
  ];
  const result = buildChartData(input({
    pages, groupByProp: tierProp, hiddenGroups: ["free"],
  }));
  assert.deepEqual(result.series.map(s => s.key), ["pro"]);
  assert.equal(result.categories.find(c => c.key === "eu")?.total, 1);
  assert.equal(result.total, 1);
});

test("chart-series: hiddenGroups removes categories without breakdown", () => {
  const pages = [
    page("p1", { region: "eu" }),
    page("p2", { region: "us" }),
  ];
  const result = buildChartData(input({ pages, hiddenGroups: ["us"] }));
  assert.deepEqual(result.categories.map(c => c.key), ["eu"]);
  assert.equal(result.total, 1);
});

test("chart-series: manual order is honored, unlisted go last", () => {
  const pages = [
    page("p1", { region: "eu" }),
    page("p2", { region: "us" }),
  ];
  const result = buildChartData(input({
    pages, sort: "manual", manualGroupOrder: ["us"],
  }));
  assert.equal(result.categories[0].key, "us");
});

test("chart-series: omit-zero with breakdown drops empty categories only", () => {
  const pages = [page("p1", { region: "eu", tier: "pro" })];
  const result = buildChartData(input({
    pages, groupByProp: tierProp, omitZero: true,
  }));
  // 'us' seeded but empty → dropped; 'eu' kept
  assert.deepEqual(result.categories.map(c => c.key), ["eu"]);
});

test("chart-series: sum aggregation across breakdown", () => {
  const amount: SchemaProperty = { id: "amount", name: "Amount", type: "number" };
  const pages = [
    page("p1", { region: "eu", tier: "free", amount: 10 }),
    page("p2", { region: "eu", tier: "pro", amount: 30 }),
    page("p3", { region: "eu", tier: "pro", amount: 5 }),
  ];
  const result = buildChartData(input({
    pages, groupByProp: tierProp, yProp: amount, aggregation: "sum",
  }));
  const eu = result.categories.find(c => c.key === "eu");
  assert.equal(eu?.values.free, 10);
  assert.equal(eu?.values.pro, 35);
  assert.equal(eu?.total, 45);
});

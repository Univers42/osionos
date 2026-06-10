/* ************************************************************************** */
/*  chart-engine.test.ts — core aggregation correctness for the chart engine */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { buildChartData } from "../../src/shared/notion-database-sys/src/lib/chart/chartEngine.ts";
import { NONE_KEY, VALUE_SERIES_KEY } from "../../src/shared/notion-database-sys/src/lib/chart/chartTypes.ts";
import type { ChartEngineInput, ChartPageLike } from "../../src/shared/notion-database-sys/src/lib/chart/chartTypes.ts";
import type { SchemaProperty } from "../../src/shared/notion-database-sys/packages/contract-types/src/index.ts";

const statusProp: SchemaProperty = {
  id: "status", name: "Status", type: "select",
  options: [
    { id: "opt-a", value: "Todo", color: "red" },
    { id: "opt-b", value: "Done", color: "green" },
  ],
};
const amountProp: SchemaProperty = { id: "amount", name: "Amount", type: "number" };
const tagsProp: SchemaProperty = {
  id: "tags", name: "Tags", type: "multi_select",
  options: [
    { id: "t1", value: "alpha", color: "blue" },
    { id: "t2", value: "beta", color: "purple" },
  ],
};

function page(id: string, props: Record<string, unknown>): ChartPageLike {
  return { id, properties: props as ChartPageLike["properties"] };
}

function input(over: Partial<ChartEngineInput>): ChartEngineInput {
  return { pages: [], xProp: statusProp, aggregation: "count", ...over };
}

test("chart-engine: empty pages produce seeded zero groups, omitZero drops them", () => {
  const result = buildChartData(input({ pages: [] }));
  assert.equal(result.categories.length, 2); // seeded from options
  assert.equal(result.total, 0);
  const omitted = buildChartData(input({ pages: [], omitZero: true }));
  assert.equal(omitted.categories.length, 0);
});

test("chart-engine: all-null x lands in the No-property group", () => {
  const pages = [page("p1", {}), page("p2", { status: null })];
  const result = buildChartData(input({ pages, omitZero: true }));
  assert.equal(result.categories.length, 1);
  assert.equal(result.categories[0].key, NONE_KEY);
  assert.equal(result.categories[0].label, "No Status");
  assert.equal(result.categories[0].total, 2);
});

test("chart-engine: count vs sum stay correct with mixed numeric/non-numeric y", () => {
  // Regression for the legacy idx%2 interleave bug: non-numeric y values
  // used to corrupt both count and sum.
  const pages = [
    page("p1", { status: "opt-a", amount: 10 }),
    page("p2", { status: "opt-a", amount: "not-a-number" }),
    page("p3", { status: "opt-a", amount: "5" }), // numeric string coerces
    page("p4", { status: "opt-a" }),              // missing y
  ];
  const count = buildChartData(input({ pages, yProp: amountProp, aggregation: "count" }));
  const todo = count.categories.find(c => c.key === "opt-a");
  assert.equal(todo?.values[VALUE_SERIES_KEY], 4);

  const sum = buildChartData(input({ pages, yProp: amountProp, aggregation: "sum" }));
  assert.equal(sum.categories.find(c => c.key === "opt-a")?.values[VALUE_SERIES_KEY], 15);

  const avg = buildChartData(input({ pages, yProp: amountProp, aggregation: "average" }));
  assert.equal(avg.categories.find(c => c.key === "opt-a")?.values[VALUE_SERIES_KEY], 7.5);
});

test("chart-engine: min/max/median aggregations", () => {
  const pages = [
    page("p1", { status: "opt-b", amount: 4 }),
    page("p2", { status: "opt-b", amount: 9 }),
    page("p3", { status: "opt-b", amount: 1 }),
  ];
  const done = (agg: "min" | "max" | "median") =>
    buildChartData(input({ pages, yProp: amountProp, aggregation: agg }))
      .categories.find(c => c.key === "opt-b")?.values[VALUE_SERIES_KEY];
  assert.equal(done("min"), 1);
  assert.equal(done("max"), 9);
  assert.equal(done("median"), 4);
});

test("chart-engine: count without yProp counts items per group", () => {
  const pages = [
    page("p1", { status: "opt-a" }),
    page("p2", { status: "opt-b" }),
    page("p3", { status: "opt-b" }),
  ];
  const result = buildChartData(input({ pages }));
  assert.equal(result.categories.find(c => c.key === "opt-a")?.total, 1);
  assert.equal(result.categories.find(c => c.key === "opt-b")?.total, 2);
  assert.equal(result.total, 3);
});

test("chart-engine: multi-select pages count in every matching group", () => {
  const pages = [
    page("p1", { tags: ["t1", "t2"] }),
    page("p2", { tags: ["t1"] }),
  ];
  const result = buildChartData(input({ pages, xProp: tagsProp }));
  assert.equal(result.categories.find(c => c.key === "t1")?.total, 2);
  assert.equal(result.categories.find(c => c.key === "t2")?.total, 1);
  // drilldown ids preserved per group
  assert.deepEqual(
    result.categories.find(c => c.key === "t1")?.pageIds[VALUE_SERIES_KEY],
    ["p1", "p2"],
  );
});

test("chart-engine: single group keeps colors from select options", () => {
  const pages = [page("p1", { status: "opt-b" })];
  const result = buildChartData(input({ pages, omitZero: true }));
  assert.equal(result.categories.length, 1);
  assert.equal(result.categories[0].color, "green");
  assert.equal(result.series.length, 1);
  assert.equal(result.series[0].key, VALUE_SERIES_KEY);
});

test("chart-engine: ascending/descending sort orders by label", () => {
  const pages = [
    page("p1", { status: "opt-b" }), // Done
    page("p2", { status: "opt-a" }), // Todo
  ];
  const asc = buildChartData(input({ pages, sort: "ascending" }));
  assert.deepEqual(asc.categories.map(c => c.label), ["Done", "Todo"]);
  const desc = buildChartData(input({ pages, sort: "descending" }));
  assert.deepEqual(desc.categories.map(c => c.label), ["Todo", "Done"]);
});

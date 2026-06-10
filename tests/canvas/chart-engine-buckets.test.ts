/* ************************************************************************** */
/*  chart-engine-buckets.test.ts — date bucketing, cumulative, server parity */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { buildChartData } from "../../src/shared/notion-database-sys/src/lib/chart/chartEngine.ts";
import { assembleChartResult } from "../../src/shared/notion-database-sys/src/lib/chart/chartAssemble.ts";
import {
  autoGranularity, bucketDateKey, bucketLabel,
} from "../../src/shared/notion-database-sys/src/lib/chart/chartBuckets.ts";
import type {
  AggregatedMatrix, ChartEngineInput, ChartPageLike,
} from "../../src/shared/notion-database-sys/src/lib/chart/chartTypes.ts";
import { VALUE_SERIES_KEY } from "../../src/shared/notion-database-sys/src/lib/chart/chartTypes.ts";
import type { SchemaProperty } from "../../src/shared/notion-database-sys/packages/contract-types/src/index.ts";

const dateProp: SchemaProperty = { id: "when", name: "When", type: "date" };
const DAY = 86_400_000;

function page(id: string, props: Record<string, unknown>): ChartPageLike {
  return { id, properties: props as ChartPageLike["properties"] };
}

function input(over: Partial<ChartEngineInput>): ChartEngineInput {
  return { pages: [], xProp: dateProp, aggregation: "count", ...over };
}

test("chart-buckets: bucket keys per granularity", () => {
  const ms = new Date("2026-06-10T15:30:00Z").getTime();
  assert.equal(bucketDateKey(ms, "day"), "2026-06-10");
  assert.equal(bucketDateKey(ms, "month"), "2026-06");
  assert.equal(bucketDateKey(ms, "quarter"), "2026-Q2");
  assert.equal(bucketDateKey(ms, "year"), "2026");
  // week starts Monday: 2026-06-10 is a Wednesday → week of 2026-06-08
  assert.equal(bucketDateKey(ms, "week"), "2026-06-08");
  assert.equal(bucketLabel("2026-Q2", "quarter"), "Q2 2026");
  assert.equal(bucketLabel("2026-06", "month"), "Jun 2026");
});

test("chart-buckets: auto granularity follows the data span", () => {
  const t0 = new Date("2026-01-01T00:00:00Z").getTime();
  assert.equal(autoGranularity(t0, t0 + 10 * DAY), "day");
  assert.equal(autoGranularity(t0, t0 + 90 * DAY), "week");
  assert.equal(autoGranularity(t0, t0 + 400 * DAY), "month");
  assert.equal(autoGranularity(t0, t0 + 900 * DAY), "quarter");
  assert.equal(autoGranularity(t0, t0 + 2000 * DAY), "year");
});

test("chart-buckets: date axis groups chronologically regardless of label", () => {
  const pages = [
    page("p1", { when: "2026-04-05" }),
    page("p2", { when: "2026-01-15" }),
    page("p3", { when: "2026-12-25" }),
  ];
  const result = buildChartData(input({
    pages, dateBucket: "month", sort: "ascending",
  }));
  assert.deepEqual(result.categories.map(c => c.key), ["2026-01", "2026-04", "2026-12"]);
  // Alphabetical label sort would have produced Apr, Dec, Jan — key sort wins.
});

test("chart-buckets: cumulative produces running totals over ascending buckets", () => {
  const pages = [
    page("p1", { when: "2026-01-10" }),
    page("p2", { when: "2026-01-20" }),
    page("p3", { when: "2026-02-10" }),
    page("p4", { when: "2026-03-10" }),
  ];
  const result = buildChartData(input({
    pages, dateBucket: "month", sort: "ascending", cumulative: true,
  }));
  assert.deepEqual(
    result.categories.map(c => c.values[VALUE_SERIES_KEY]),
    [2, 3, 4],
  );
  // Grand total stays the pre-cumulative sum of items.
  assert.equal(result.total, 4);
});

test("chart-buckets: cumulative with descending sort accumulates in display order", () => {
  const pages = [
    page("p1", { when: "2026-01-10" }),
    page("p2", { when: "2026-02-10" }),
  ];
  const result = buildChartData(input({
    pages, dateBucket: "month", sort: "descending", cumulative: true,
  }));
  assert.deepEqual(result.categories.map(c => c.key), ["2026-02", "2026-01"]);
  assert.deepEqual(result.categories.map(c => c.values[VALUE_SERIES_KEY]), [1, 2]);
});

test("chart-buckets: unparseable dates fall into the No-property group", () => {
  const pages = [
    page("p1", { when: "garbage" }),
    page("p2", { when: "2026-06-01" }),
  ];
  const result = buildChartData(input({ pages, dateBucket: "month" }));
  const labels = result.categories.map(c => c.label);
  assert.ok(labels.includes("No When"));
  assert.ok(labels.includes("Jun 2026"));
});

test("chart-buckets: pre-aggregated matrix path matches client engine (server parity)", () => {
  const pages = [
    page("p1", { when: "2026-01-10" }),
    page("p2", { when: "2026-01-12" }),
    page("p3", { when: "2026-02-01" }),
  ];
  const opts = { sort: "ascending" as const, cumulative: true };
  const clientResult = buildChartData(input({ pages, dateBucket: "month", ...opts }));

  // Simulate the server path: build the matrix from pre-aggregated numbers
  // (what op=aggregate returns) and run the shared assemble stage.
  const matrix: AggregatedMatrix = {
    categories: new Map([
      ["2026-01", {
        key: "2026-01", label: "Jan 2026", color: "",
        values: new Map([[VALUE_SERIES_KEY, 2]]),
        pageIds: new Map([[VALUE_SERIES_KEY, ["p1", "p2"]]]),
      }],
      ["2026-02", {
        key: "2026-02", label: "Feb 2026", color: "",
        values: new Map([[VALUE_SERIES_KEY, 1]]),
        pageIds: new Map([[VALUE_SERIES_KEY, ["p3"]]]),
      }],
    ]),
    seriesMeta: new Map([[VALUE_SERIES_KEY, { label: "Value", color: "" }]]),
    isDateAxis: true,
  };
  const serverResult = assembleChartResult(matrix, opts);
  assert.deepEqual(
    serverResult.categories.map(c => ({ k: c.key, v: c.values[VALUE_SERIES_KEY] })),
    clientResult.categories.map(c => ({ k: c.key, v: c.values[VALUE_SERIES_KEY] })),
  );
  assert.equal(serverResult.total, clientResult.total);
});

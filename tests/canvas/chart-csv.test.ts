/* ************************************************************************** */
/*  chart-csv.test.ts — "Save chart as CSV" serialization                    */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { chartResultToCsv } from "../../src/shared/notion-database-sys/src/lib/chart/export/chartCsv.ts";
import { VALUE_SERIES_KEY } from "../../src/shared/notion-database-sys/src/lib/chart/chartTypes.ts";
import type { ChartResult } from "../../src/shared/notion-database-sys/src/lib/chart/chartTypes.ts";

function makeResult(overrides: Partial<ChartResult>): ChartResult {
  return {
    categories: [], series: [], total: 0,
    truncatedGroups: false, truncatedSeries: false,
    ...overrides,
  };
}

test("chart-csv: single series → Category,Value with BOM", () => {
  const csv = chartResultToCsv(makeResult({
    series: [{ key: VALUE_SERIES_KEY, label: "Count", color: "" }],
    categories: [
      { key: "a", label: "Alpha", color: "", values: { [VALUE_SERIES_KEY]: 3 }, pageIds: {}, total: 3 },
      { key: "b", label: "Beta", color: "", values: { [VALUE_SERIES_KEY]: 7 }, pageIds: {}, total: 7 },
    ],
  }));
  assert.ok(csv.startsWith("﻿"), "BOM prefix");
  assert.equal(csv.replace("﻿", ""), "Category,Value\nAlpha,3\nBeta,7\n");
});

test("chart-csv: breakdown → per-series columns + Total; quoting", () => {
  const csv = chartResultToCsv(makeResult({
    series: [
      { key: "s1", label: "Open, new", color: "" },
      { key: "s2", label: 'He said "hi"', color: "" },
    ],
    categories: [
      { key: "c", label: "West, EU", color: "", values: { s1: 1, s2: 2 }, pageIds: {}, total: 3 },
    ],
  })).replace("﻿", "");
  const [header, row] = csv.trim().split("\n");
  assert.equal(header, 'Category,"Open, new","He said ""hi""",Total');
  assert.equal(row, '"West, EU",1,2,3');
});

test("chart-csv: missing series values fall back to 0", () => {
  const csv = chartResultToCsv(makeResult({
    series: [{ key: "s1", label: "A", color: "" }, { key: "s2", label: "B", color: "" }],
    categories: [{ key: "c", label: "C", color: "", values: { s1: 5 }, pageIds: {}, total: 5 }],
  })).replace("﻿", "");
  assert.equal(csv.trim().split("\n")[1], "C,5,0,5");
});

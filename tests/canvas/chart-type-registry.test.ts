/* ************************************************************************** */
/*  chart-type-registry.test.ts — preset registry + echarts option builders  */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  getChartTypeDef, chartTypesByFamily, FALLBACK_CHART_TYPE,
} from "../../src/shared/notion-database-sys/src/lib/chart/chartTypeRegistry.ts";
import { wrapAxisLabel } from "../../src/shared/notion-database-sys/src/components/views/chart/echarts/echartsBuildersCore.ts";
import { CHART_TYPE_PRESETS } from "../../src/shared/notion-database-sys/src/lib/chart/chartTypePresets.ts";
import {
  matrixGrid, percentGrid, heatmapCells, hierarchyData, sankeyData,
  waterfallSegments, calendarCells,
} from "../../src/shared/notion-database-sys/src/lib/chart/chartEchartsData.ts";
import { buildEChartsOption } from "../../src/shared/notion-database-sys/src/components/views/chart/echarts/echartsBuilderRegistry.ts";
import type { BuilderCtx } from "../../src/shared/notion-database-sys/src/components/views/chart/echarts/echartsBuildersCore.ts";
import type { ChartResult } from "../../src/shared/notion-database-sys/src/lib/chart/chartTypes.ts";

const RESULT: ChartResult = {
  categories: [
    { key: "2026-01-05", label: "Jan 5", color: "", values: { a: 4, b: 6 }, pageIds: {}, total: 10 },
    { key: "2026-01-12", label: "Jan 12", color: "", values: { a: 1, b: 3 }, pageIds: {}, total: 4 },
    { key: "2026-01-19", label: "Jan 19", color: "", values: { a: 5, b: 0 }, pageIds: {}, total: 5 },
  ],
  series: [
    { key: "a", label: "Alpha", color: "" },
    { key: "b", label: "Beta", color: "" },
  ],
  total: 19,
  truncatedGroups: false,
  truncatedSeries: false,
};

test("chart-registry: 50+ presets, unique ids, valid engines, fallback", () => {
  assert.ok(CHART_TYPE_PRESETS.length >= 50, `${CHART_TYPE_PRESETS.length} presets`);
  const ids = new Set(CHART_TYPE_PRESETS.map(def => def.id));
  assert.equal(ids.size, CHART_TYPE_PRESETS.length, "ids are unique");
  for (const def of CHART_TYPE_PRESETS) {
    assert.ok(def.engine === "recharts" || def.engine === "echarts", def.id);
    assert.equal(getChartTypeDef(def.id).id, def.id);
  }
  assert.equal(getChartTypeDef("no-such-type").id, FALLBACK_CHART_TYPE);
  assert.equal(getChartTypeDef(undefined).id, FALLBACK_CHART_TYPE);
});

test("chart-registry: legacy five stay on recharts; families cover gallery", () => {
  for (const id of ["vertical_bar", "horizontal_bar", "line", "donut", "number"]) {
    assert.equal(getChartTypeDef(id).engine, "recharts", id);
  }
  const families = chartTypesByFamily().map(([family]) => family);
  for (const family of ["bar", "line", "area", "pie", "scatter", "radar", "heatmap", "hierarchy", "flow", "stat"]) {
    assert.ok(families.includes(family as never), `family ${family}`);
  }
});

test("echarts-data: matrix, percent, heatmap, hierarchy, sankey, waterfall, calendar", () => {
  assert.deepEqual(matrixGrid(RESULT), [[4, 1, 5], [6, 3, 0]]);

  const pct = percentGrid(RESULT);
  for (let col = 0; col < RESULT.categories.length; col++) {
    const sum = pct.reduce((acc, row) => acc + row[col], 0);
    assert.ok(Math.abs(sum - 100) < 0.51, `column ${col} ≈ 100 (${sum})`);
  }

  const { cells, max } = heatmapCells(RESULT);
  assert.equal(cells.length, 6);
  assert.equal(max, 6);

  const tree = hierarchyData(RESULT);
  assert.equal(tree[0].children?.length, 2);
  assert.equal(tree[2].children?.length, 1, "zero-value child dropped");

  const { nodes, links } = sankeyData(RESULT);
  assert.equal(nodes.length, 5);
  assert.equal(links.length, 5, "zero flows skipped");
  assert.equal(links.reduce((acc, link) => acc + link.value, 0), 19);

  const wf = waterfallSegments(RESULT);
  assert.deepEqual(wf.deltas, [10, 4, 5, 19]);
  assert.deepEqual(wf.offsets, [0, 10, 14, 0]);

  const calendar = calendarCells(RESULT);
  assert.deepEqual(calendar[0], ["2026-01-05", 10]);
});

test("echarts-builders: every echarts preset yields a series-bearing option", () => {
  for (const def of CHART_TYPE_PRESETS) {
    if (def.engine !== "echarts") continue;
    const ctx: BuilderCtx = {
      result: RESULT,
      settings: { chartType: def.id, yAxisGroupBy: "g", xAxisProperty: "x" },
      def,
      colors: ["#111111", "#222222", "#333333"],
    };
    const option = buildEChartsOption(ctx);
    const series = option.series as unknown[];
    assert.ok(Array.isArray(series) && series.length > 0, `${def.id} has series`);
  }
});

test("echarts-builders: stacking/percent/horizontal variants are wired", () => {
  const make = (id: string) => buildEChartsOption({
    result: RESULT, settings: {}, def: getChartTypeDef(id),
    colors: ["#111111"],
  });
  const stacked = make("stacked_bar").series as { stack?: string }[];
  assert.equal(stacked[0].stack, "total");
  const grouped = make("grouped_bar").series as { stack?: string }[];
  assert.equal(grouped[0].stack, undefined);
  const horizontal = make("stacked_bar_h") as { yAxis: { type: string } };
  assert.equal(horizontal.yAxis.type, "category");
  const percent = make("percent_bar").series as { data: number[] }[];
  const colSum = percent[0].data[0] + percent[1].data[0];
  assert.ok(Math.abs(colSum - 100) < 0.51);
});

test("echarts-builders: the funnel keeps option colours and drops empty stages", () => {
  const funnelResult: ChartResult = {
    categories: [
      { key: "won", label: "Won", color: "var(--color-success)", values: {}, pageIds: {}, total: 5 },
      { key: "lead", label: "Lead", color: "", values: {}, pageIds: {}, total: 9 },
      { key: "lost", label: "Lost", color: "var(--color-danger)", values: {}, pageIds: {}, total: 0 },
    ],
    series: [],
    total: 14,
    truncatedGroups: false,
    truncatedSeries: false,
  };
  const funnel = buildEChartsOption({
    result: funnelResult, settings: {}, def: getChartTypeDef("funnel"),
    colors: ["#111111"],
  }).series as { data: { name: string; value: number; itemStyle?: { color: string } }[] }[];
  assert.equal(funnel[0].data.length, 2, "zero-total stage dropped");
  assert.ok(!funnel[0].data.some((item) => item.name === "Lost"), "no Lost stage");
  const won = funnel[0].data.find((item) => item.name === "Won");
  assert.equal(won?.itemStyle?.color, "var(--color-success)");
  const lead = funnel[0].data.find((item) => item.name === "Lead");
  assert.equal(lead?.itemStyle, undefined, "colourless Lead keeps the palette");
});

test("echarts-builders: long category names wrap onto two lines at the middle space", () => {
  assert.equal(wrapAxisLabel("Won"), "Won");
  assert.equal(wrapAxisLabel("Kenji Watanabe"), "Kenji\nWatanabe");
  assert.equal(wrapAxisLabel("Middle East & Africa"), "Middle East\n& Africa");
  assert.equal(wrapAxisLabel("Supercalifragilistic"), "Supercalifragilistic", "no space to split on");
  assert.equal(wrapAxisLabel("Amara Diallo"), "Amara\nDiallo");
});

test("echarts-builders: a bar chart shows every one of a few category names", () => {
  const owners = ["Amara Diallo", "Lucas Martin", "Sofia Rossi", "Kenji Watanabe", "Priya Nair"];
  const workload: ChartResult = {
    categories: owners.map((name, index) => ({
      key: `owner-${index}`, label: name, color: "",
      values: { a: index + 1, b: 5 - index }, pageIds: {}, total: 6,
    })),
    series: [
      { key: "a", label: "Alpha", color: "" },
      { key: "b", label: "Beta", color: "" },
    ],
    total: 30,
    truncatedGroups: false,
    truncatedSeries: false,
  };
  const vertical = buildEChartsOption({
    result: workload, settings: {}, def: getChartTypeDef("stacked_bar"),
    colors: ["#111111"],
  }) as {
    xAxis: { axisLabel: { interval: number | string; lineHeight: number; formatter: (label: string) => string } };
    grid: { bottom: number };
  };
  assert.equal(vertical.xAxis.axisLabel.interval, 0, "few categories: show every label");
  assert.equal(vertical.xAxis.axisLabel.lineHeight, 14, "wrapped second line is 14px tall");
  assert.equal(vertical.xAxis.axisLabel.formatter("Kenji Watanabe"), "Kenji\nWatanabe");
  assert.equal(vertical.grid.bottom, 62, "one extra 14px label line over the legend");

  const horizontal = buildEChartsOption({
    result: workload, settings: {}, def: getChartTypeDef("stacked_bar_h"),
    colors: ["#111111"],
  }) as { yAxis: { axisLabel: { formatter?: unknown } } };
  assert.equal(horizontal.yAxis.axisLabel.formatter, undefined, "horizontal case stays as today");

  const thirteen: ChartResult = {
    categories: Array.from({ length: 13 }, (_, index) => ({
      key: `c${index}`, label: `C${index + 1}`, color: "",
      values: { a: 1, b: 2 }, pageIds: {}, total: 3,
    })),
    series: [
      { key: "a", label: "Alpha", color: "" },
      { key: "b", label: "Beta", color: "" },
    ],
    total: 39,
    truncatedGroups: false,
    truncatedSeries: false,
  };
  const grouped = buildEChartsOption({
    result: thirteen, settings: {}, def: getChartTypeDef("grouped_bar"),
    colors: ["#111111"],
  }) as { xAxis: { axisLabel: { interval: number | string } }; grid: { bottom: number } };
  assert.equal(grouped.xAxis.axisLabel.interval, "auto", "13+ categories keep ECharts spacing");
  assert.equal(grouped.grid.bottom, 48, "short labels never wrap: no extra bottom slot");
});

/* ************************************************************************** */
/*  chart-option-colors.test.ts — select options paint charts in real colors  */
/* ************************************************************************** */

// Option colors are Tailwind class pairs. Charts used to hand them straight to
// ECharts / SVG fills, which read them as invalid and painted every series and
// slice grouped by a select black (a stacked bar by Stage, a donut by Region).

import assert from "node:assert/strict";
import test from "node:test";

import { optionColorToCss } from "../../src/shared/notion-database-sys/src/utils/color.ts";
import { buildChartData } from "../../src/shared/notion-database-sys/src/lib/chart/chartEngine.ts";
import type { ChartPageLike } from "../../src/shared/notion-database-sys/src/lib/chart/chartTypes.ts";
import type { SchemaProperty } from "../../src/shared/notion-database-sys/packages/contract-types/src/index.ts";

const SEED_TAG_COLORS: ReadonlyArray<[string, string]> = [
  ["bg-warning-surface-muted text-warning-text-tag", "var(--color-warning)"],
  ["bg-accent-muted text-accent-text-bold", "var(--color-accent)"],
  ["bg-accent-subtle text-accent-text-bold", "var(--color-accent)"],
  ["bg-purple-surface-muted text-purple-text-tag", "var(--color-purple)"],
  ["bg-violet-surface-muted text-violet-text-tag", "var(--color-purple)"],
  ["bg-orange-surface-muted text-orange-text-tag", "var(--color-orange)"],
  ["bg-success-surface-muted text-success-text-tag", "var(--color-success)"],
  ["bg-success-surface-medium text-success-text-tag", "var(--color-success)"],
  ["bg-danger-surface-muted text-danger-text-tag", "var(--color-danger)"],
  ["bg-surface-muted text-ink-strong", "var(--color-chart-label)"],
  ["bg-teal-surface-muted text-teal-text-tag", "var(--color-cyan)"],
];

test("chart-option-colors: every seeded tag class maps to its family's color variable", () => {
  for (const [optionClass, expected] of SEED_TAG_COLORS) {
    assert.equal(optionColorToCss(optionClass), expected, optionClass);
  }
});

test("chart-option-colors: real colors pass through, unknown and empty fall back to ''", () => {
  for (const color of ["green", "#2383e2", "rgb(1, 2, 3)", "oklch(0.7 0.1 30)", "var(--color-chart-3)"]) {
    assert.equal(optionColorToCss(color), color);
  }
  assert.equal(optionColorToCss(""), "");
  assert.equal(optionColorToCss(undefined), "");
  assert.equal(optionColorToCss("bg-brand-500 text-white"), "");
});

test("chart-option-colors: categories and series grouped by a select carry real colors", () => {
  const stage: SchemaProperty = {
    id: "stage", name: "Stage", type: "select",
    options: [
      { id: "lead", value: "Lead", color: "bg-warning-surface-muted text-warning-text-tag" },
      { id: "won", value: "Won", color: "bg-success-surface-muted text-success-text-tag" },
    ],
  };
  const owner: SchemaProperty = {
    id: "owner", name: "Owner", type: "select",
    options: [{ id: "amara", value: "Amara", color: "bg-orange-surface-muted text-orange-text-tag" }],
  };
  const pages: ChartPageLike[] = [
    { id: "p1", properties: { stage: "lead", owner: "amara" } },
    { id: "p2", properties: { stage: "won", owner: "amara" } },
  ];
  const byStage = buildChartData({ pages, xProp: stage, aggregation: "count" });
  assert.deepEqual(byStage.categories.map(c => c.color), ["var(--color-warning)", "var(--color-success)"]);

  const stacked = buildChartData({ pages, xProp: owner, groupByProp: stage, aggregation: "count" });
  assert.equal(stacked.categories[0].color, "var(--color-orange)");
  assert.deepEqual(stacked.series.map(s => s.color).sort(), ["var(--color-success)", "var(--color-warning)"]);
});

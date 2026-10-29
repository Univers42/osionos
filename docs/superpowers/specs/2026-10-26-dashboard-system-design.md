# Dashboards that tell the truth — design

Date: 2026-10-26 · Branch: `feat/dashboard-system` · Owner request (2026-10-26, verbatim
intent): make tables, views and dashboards "appealing and powerful" like the Products
*Overview Dashboard* on the Workspace command center (KPI numbers with an icon and a
description, a headbar, mixed charts with good legends and titles), make every number
dynamic because today they "look hardcoded and not true", let people put more
information in each cell, and use one style everywhere.

## Why: what is wrong today (evidence)

| # | Defect | Evidence |
|---|---|---|
| 1 | A KPI counts every record when it should count checked ones | `widgets/StatWidget.tsx:resolveStatValue`: `!propertyId \|\| aggregation === 'count'` returns `total`. The Products *Featured Count* tile shows **300**; the seed has **60** featured (`jq` over `store/dbms/json/_notion_state.json`). |
| 2 | Labels claim what the data can't support | *Total Revenue* is `sum(pp-price)` = 15,679, the summed list prices of 300 products. Nothing in the data is revenue. |
| 3 | Insight text is a frozen string, and it is wrong | `databaseViewShowcase.ts:VIEW_INSIGHTS` says "3.64 average rating"; the seed's rating counts (14/33/88/109/56) give **3.53**. "8 tasks", "530K USD" and the rest are literals too. |
| 4 | Template numbers have no data behind them | `src/data/templates/studentDashboard.ts:31-33`: `metricCell(..., '3.7', 'GPA')`, `'15'`, `'Fri'`. The template binds `db-tasks` and `db-events` only; no grade or credit exists anywhere. |
| 5 | The command center shows "Untitled" chips | `MainContent.tsx:71-75` stores database *keys* (`"projects"`) and view *names* as relation values; the relation chip resolves ids, misses, and prints "Untitled". |
| 6 | KPI icons and colours mean nothing | `renderStatWidget` picks `STAT_ICONS[idx % 6]` and `STAT_COLORS[idx % …]` by position, so moving a tile changes its icon. |
| 7 | The chart palette fails colour-blind and normal-vision checks | `--osio-chart-1` = accent `#1F5BC4` and `--osio-chart-2` = tint blue `#1E6DB0`: normal-vision ΔE **6.2** (floor 15); CVD worst ΔE **2.2** (`validate_palette.js`, dataviz skill). Clothing and Electronics read as one colour. |
| 8 | Two dashboard systems that look different | The legacy preset grid (`DashboardView.tsx:WidgetGrid`, `settings.widgets`) has the icon tiles and charts but can't be edited. The Notion model (`settings.dashboardRows`, `DashboardNotionView`) can be edited, but its KPI (`notion/StatKpi.tsx`) is a bare number and caption. |
| 9 | Chart details | The trend line overshoots between points (non-monotone smoothing dips below real values); axis labels are ~18 px while legend labels are 9 px; there are no y-axis values. |

## Status (2026-10-26)

| # | Defect | State |
|---|---|---|
| 1 | KPI counts every record | Fixed: `notion/model/kpiModel.ts` computes over the view's own filtered pages; tiles show a provenance line ("56% of 55 records"). |
| 2 | Labels claim revenue | Fixed: Products tiles read *Catalog list value*. The commerce *Total Revenue* tile sums order totals of an orders table, which is revenue. |
| 3 | Frozen insight text | Fixed: the showcase cells carry no literals; the hero embeds the live `v-proj-dashboard` view (`tests/canvas/page-actions-turn-into-dashboard.test.ts` asserts no digit in any non-database block). |
| 4 | Template numbers | GPA, credits, `Fri` and the Grade Calculator's `86` are removed (`tests/canvas/seed-templates-typed-figures.test.ts`). The live `/metric` replacements are not built: there is no `/metric` block yet. |
| 5 | "Untitled" chips | Fixed: chips hold multi-select labels. |
| 6 | Icons by position | Fixed: the icon is stored per tile. |
| 7 | Palette | Fixed: `--osio-chart-1..8` are palette tokens (`scripts/tokens/ramps.mjs` `CHART_SERIES`). The validator is not wired into `build-tokens.mjs --check`, and only the default palette's surfaces were validated. |
| 8 | Two systems | Open, deliberately: the legacy preset grid still renders the seeded presets. Merging them (phase 3) has no caller asking for it yet. |
| 9 | Chart details | Donut legend sits beside the ring, bar labels wrap instead of truncating, widgets drop the full-read badge. Monotone smoothing and y-axis values are not re-checked. |

## Goals

1. **Every number is computed from records, and says how.** A tile shows its value
   plus a provenance line: "Count of Products where Featured is checked · 60 of
   300". Its tooltip lists the view filters and dashboard filters that applied. A
   template or seed never contains a literal metric.
2. **One dashboard system, one look.** The Notion model (`dashboardRows`) is the only
   renderer. Legacy `settings.widgets` dashboards are adapted at read time, so every
   existing dashboard gets the new look and becomes editable with no stored-data
   migration.
3. **A richer KPI tile.** It has an icon, a label, an optional description, and a
   formatted value (number, currency, percent, compact). It can show a delta against
   the previous period on a date property, a sparkline, and an optional target with
   progress. The icon and tone are chosen per tile and stored with it.
4. **A chart widget configured in the widget itself.** It has a title, an
   auto-subtitle ("Count of Products by Category"), a legend for two or more series,
   axis values, hover tooltips, and a table toggle. It renders the existing chart
   engine (`views/chart/*`), so there is still one chart implementation.
5. **A dashboard headbar.** It has a title, an editable description, data-source chips
   with the real database names, the existing global filter bar plus a date-range
   control, "Updated <relative time>", and Edit layout.
6. **A `/metric` page block** that renders the same KPI tile bound to a database view.
   It replaces the literal metric cells in templates and in the command-center
   showcase, so a KPI looks the same on a page canvas as on a dashboard.
7. **A validated chart palette in both themes** (below), generated by the token
   pipeline like every other colour.

## Non-goals

- No new chart library. ECharts and the SVG charts in `views/chart/` stay; no
  dependency is added.
- No server-side aggregation in this project. Tiles compute over the records the
  client already has. The slow-load fix (bridge gzip, `?dbKey=`) is tracked separately.
- No AI-written insight text. Sentences are templates filled from computed values or
  are deleted.

## Anti-goals (a failure even if it works)

- Any number on screen that the user can't trace to records and filters.
- A second KPI or chart component that diverges in style from the first.
- A tile showing 0 or a stale value with no state. "No records match" and "Needs a
  number property" are designed empty states.
- An interaction over 20 ms at 10K records. This is measured with the perf harness;
  KPI and chart aggregation are memoised per (records, config) in one pass.

## Model (contract-types, notion-database-sys)

`DashboardViewWidget` gains two optional presentation configs beside `stat`. A widget
is still a backing view (records plus that view's filters) shown one of three ways:
the embedded view, a KPI, or a chart.

```ts
export interface DashboardStatConfig {          // extended, all new fields optional
  fn: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'median' | 'distinct' | 'percent';
  propertyId?: string;
  where?: Filter[];                              // counts "Featured is checked"; percent = where / all
  format?: { style: 'number' | 'currency' | 'percent' | 'compact'; currency?: string; decimals?: number; unit?: string };
  icon?: string;                                 // lucide name, stored → stable when tiles move
  tone?: 'neutral' | 'accent' | 'good' | 'warning' | 'critical';
  label?: string; description?: string;
  compare?: { datePropertyId: string; period: 'week' | 'month' | 'quarter' | 'year'; goodDirection: 'up' | 'down' };
  spark?: { datePropertyId: string; bucket: 'day' | 'week' | 'month' };
  target?: number;
}
export interface DashboardChartConfig {         // a subset of the chart view's own settings
  chartType: string; xAxisProperty: string; yAxisAggregation?: ViewSettings['yAxisAggregation'];
  yAxisProperty?: string; yAxisGroupBy?: string; xAxisDateBucket?: ViewSettings['xAxisDateBucket'];
  subtitle?: string; showDataLabels?: boolean;
}
DashboardViewWidget.chart?: DashboardChartConfig;
ViewSettings.dashboardDescription?: string;
```

- **Pure aggregation library** (`dashboard/model/kpi.ts`): `computeKpi(pages, props, stat, now)`
  returns `{ value, formatted, provenance, delta?, spark?, empty? }`. It is the only
  place a KPI is computed. It replaces `resolveStatValue` and the `StatKpi`
  arithmetic, which fixes defect 1 at the shared function.
- **Legacy adapter** (`dashboard/model/legacyWidgets.ts`): `legacyWidgetsToRows(widgets, hostViewId)`
  returns `{ dashboardWidgets, dashboardRows }`. It maps a stat widget to `stat`
  (checkbox count becomes `where: checked`), a chart widget to `chart` (the legacy
  styles map to chart-registry presets), and table/list widgets to an embedded table
  view. It is used at read time when `dashboardRows` is absent; the first edit saves
  the new form. The legacy `WidgetGrid` and auto-detect paths are deleted once the
  adapter covers every seeded dashboard.
- **Seeds** (`productSeedViews.ts` and the other seed views) emit the new form
  directly with honest labels: *Catalog list value* (not revenue) and *Featured* as
  count where checked.
- **Chart widget rendering:** a settings-override seam on the chart engine
  (`ChartView`/`useChartData` take `settings` from the widget instead of the active
  view). The exact prop shape is the builder's call.

## Visual system (one style everywhere)

The mockup is linked in the PR and the ledger. These are the rules it encodes:

- **Tile:** an icon badge on a tinted square, tinted by tone rather than position. The
  label sits above the value. The value is 28 px Inter, tabular numerals. The delta
  pill shows ▲/▼ plus a word ("up"/"down") so it isn't colour alone; its colour comes
  from `goodDirection`. The sparkline is a 2 px line with a faint area and an
  emphasised endpoint. The provenance line is muted 12 px. Content sets the height:
  no empty band under the number.
- **Card titles** use Newsreader, the app's serif, as today. The subtitle is Inter
  13 px muted. Legend and axis text share one size (12 px), with axis text in muted
  ink. The grid is recessive and dashed at the `--osio-border-default` tone.
- **Headbar:** a serif title and a one-line description, then chips for sources and
  filters, with the update time on the right. It sticks inside the pane.
- **Empty and partial states:** a one-line reason plus the action that fixes it, such
  as "Pick a number property" or "Clear filters".
- **Palette:** `--osio-chart-1..8` get their own generated values. They are no longer
  aliases of accent and block tints. Validated with
  `node scripts/validate_palette.js … --mode light|dark`:
  - light `#2a6fd6,#d9622b,#14a06f,#d99400,#d6699a,#2f8a1f,#6a55d4,#d64545` on
    `#FFFFFF`: all hard gates pass. Worst adjacent CVD ΔE is 8.6 and normal-vision
    ΔE is 20.3. Yellow is 2.57:1 against the surface (a WARN), so legends and the
    table toggle are mandatory, and they are already in the design.
  - dark `#4a8ee8,#d95926,#199e70,#c98500,#d55181,#3f9a2a,#9085e9,#e66767` on
    `#23221F`: all pass. CVD ΔE is 8.4 and normal-vision ΔE is 19.3.
  - Status colours stay `--osio-success/warning/danger`, never a series colour.
  - A ninth category folds into "Other".
  - The other palettes (Calm is the default) re-step the same hue order in
    `scripts/tokens/`, and `build-tokens.mjs --check` gains this validation.

## Replacing hardcoded content

| Where | Today | After |
|---|---|---|
| Student Dashboard template | `3.7 GPA`, `15 Credits`, `Fri` | `/metric` blocks on `db-tasks`: *Open assignments* (count where status ≠ Done), *Due this week* (count where due ∈ next 7 days), *Next deadline* (min due date of open ones). GPA and Credits are removed: no data backs them. |
| Command-center showcase | `VIEW_INSIGHTS` literals and the metrics callout | `/metric` blocks per showcase cell, computed live. The callout sentence is built from those values or deleted. |
| Command-center properties | "Untitled" chips | Relation values store database and view ids, and the chip resolves names (defect 5). |
| Products Overview / Analytics, Inventory | Legacy presets | Seeds in the new form with honest labels; one look. |

## Phases (each ships as its own PR, CI green, merged to main)

1. **Truth fixes.** `computeKpi` with tests, which fixes defects 1, 2, 3 (the literal
   insights are deleted) and 6 (per-tile icon). Also the "Untitled" chips and monotone
   smoothing. Small and visible.
2. **Tile v2, headbar, palette.** Extended `stat`, KPI tile component, headbar, chart
   tokens and validator in the token gate.
3. **Chart widget and legacy adapter.** `chart` config, engine settings seam,
   `legacyWidgetsToRows`, seeds rewritten, legacy grid deleted.
4. **`/metric` block and templates.** The block, the Student Dashboard, and the
   command-center showcase moved onto it.

## Verification

- Unit (`tests/canvas`): `computeKpi` covers every fn, a checkbox `where`, empty
  input, non-numeric values, compare and spark bucketing, and formatting. Also
  `legacyWidgetsToRows` round trips for every seeded preset. A property-based test
  (fast-check is not installed, so a seeded generator) checks that
  sum/avg/min/max agree with a naive fold on random records.
- e2e: the Products Overview shows **Featured 60** (not 300), and a tile's provenance
  names its filters. Changing a dashboard filter changes the tile and the chart in
  one frame. The Student Dashboard shows values computed from `db-tasks` that update
  when a task is marked Done. Command-center chips show real names.
- Visual: before and after screenshots, light and dark, at 1440 and 375, in each PR.
- Perf: a `__perfRun` dashboard scenario at 10K records, with p95 interaction under
  20 ms recorded in the PR.

## Left to the builder

- Component file split under `dashboard/notion/` (≤300 lines each).
- The settings-override prop shape on the chart engine.
- Icon picker UI. Reusing the existing lucide icon picker is preferred.

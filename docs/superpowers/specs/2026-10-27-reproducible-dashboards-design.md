# Reproducible dashboards: design

Date: 2026-10-27. Extends `2026-10-26-dashboard-system-design.md`, which stays the
authority on the model (`computeKpi`, the stat and chart configs, the visual system).
This document adds one rule and the work that enforces it.

**The rule: everything osionos ships as a dashboard, a Home section or a template
is made of parts a user can add from the app's own menus.** When a user can't
rebuild a shipped dashboard with "Add widget" and the `/` menu, the shipped one is a
demonstration, not the product.

The owner raised this on 2026-10-27: "the issue is if the shape of the dashboard or the
widgets are a demonstration that is not capable to reproduce our dashboard system".
In the same conversation they also asked for templates that create databases tied to
the user's account, and a Home built from the account's real data with real
interactions.

## Why: what can't be reproduced today (verified 2026-10-27, develop 9344eb91b)

| # | Piece | Can a user rebuild it? | Evidence |
|---|---|---|---|
| 1 | 13 of 14 shipped dashboard views | No. 11 use the legacy `settings.widgets` grid and 2 are hardwired components | presets `commerce` (stats, crm, payroll), `agency` (Case Stats), `opsActivity` (budget, support, ratings), `gourmand` (revenue, support); `productSeedViews.ts:86,105` (legacy), `:132` (`formulaAnalytics`); `relationSeedViews.ts:77` (`relationAnalytics`); dispatch `DashboardView.tsx:81-82` |
| 2 | "Customize layout" on a legacy dashboard | It empties the dashboard | `DashboardView.tsx:96` writes `dashboardRows: []`; `DashboardNotionView` never reads `settings.widgets` |
| 3 | Number tiles in "Add widget" | Only count, plus sum and average of the first two number columns | `AddWidgetPicker.tsx` `numberProps.slice(0, 2)`; there is no min, max or filtered count |
| 4 | Home "Recently visited" and "Featured templates" | No. Fixed ids are routed to private adapters, and neither is in the `/` menu | `workspaceDatabaseConstants.ts:64-68`, `DatabaseBlock.tsx:229` |
| 5 | Home "Home views" | No. It is a `home_views` block type that is not in the `/` menu and lists demo views | `databaseViewCatalog.ts:168`, `HomeViewsBlock.tsx` |
| 6 | A dashboard over the user's own data | No. The bridge refuses a saved `dashboard` view on a `sys:` source | `scripts/bridge-self-views.mjs:47` (`VIEW_TYPES` has no `dashboard`, although `:64` allowlists the dashboard settings) |
| 7 | A page made from a template | Every copy shares one demo database, and that database never reaches the server | `pageStore.helpers.ts:100` `instantiateTemplateContent` clones blocks and keeps `databaseId`; templates embed `db-tasks`, `db-events`, `db-grades` (`src/data/templates/*`); `objectDatabaseSlice.ts:175` syncs only non-seed ids |
| 8 | "Use template" from Home | Missing. A template card opens the template itself | `DatabaseBlock.tsx` `renderHomePeek` → `WorkspaceRecordPeek`; `createPageFromTemplate` has two callers, the Files table "New ▾" menu (`WorkspaceDatabaseBlock.tsx:101`) and recurrence |

What already works and is reused rather than rebuilt: the Notion-model dashboard
(`DashboardNotionView`, rows of widgets, each a real view or a KPI tile), `computeKpi`
(`notion/model/kpiModel.ts`), the 55 chart presets, the `sys:` sources with per-user
saved views (`sysDatabaseViews.ts`), server persistence for user databases
(`objectDatabaseBridgeSync.ts`) and `/button` blocks.

## Goals

1. **One dashboard model.** Every dashboard renders through `DashboardNotionView`.
   Legacy `settings.widgets` is converted at read time; the first edit saves the new
   form. There is no stored-data migration and nothing is emptied. This is phase 3 of
   the 2026-10-26 design, now with a caller.
2. **The picker can build everything shipped.** Number tiles offer count, sum, average,
   min and max for every number-valued property. A chart widget is configured in the
   widget itself (the 2026-10-26 `chart` config). Formula analytics and relation
   analytics become presentations a user can choose for a widget, not view flags only
   a seed can set.
3. **Templates create the user's own databases.** Making a page from a template clones
   each database the template embeds: schema, views and rows, under fresh ids. The
   clones are registered as the user's databases, so the existing sync stores them in
   Postgres, owner-isolated. Two pages from one template share nothing.
4. **"Use template" works from Home.** A template card can be used, not only previewed.
5. **Home is an account dashboard built from insertable parts.**
   - Number tiles, charts and lists over the `sys:` sources (pages, tasks, published,
     connections, workspaces, activity).
   - Recently visited and Templates, each as a data source in the `/` "My data" group.
   - `/button` quick actions.
   - The `home_views` launcher of demo views leaves Home. Its renderer stays for old
     pages.
6. **Dashboards over account data save.** The bridge accepts `dashboard` views on
   `sys:` sources, inside the existing size and key limits.

## Non-goals

- No new chart library, no server-side aggregation, no AI-written text (as in the
  2026-10-26 design).
- No change to the demo seed rows themselves. The owner said the demo data is not the
  issue.
- Duplicating a page does not clone its databases in this project. Server-side
  duplication (`duplicateViaServer`) copies content on the bridge, so cloning there is
  a bridge change of its own.

## Anti-goals (a failure even if it works)

- A shipped dashboard, Home section or template that uses a component, view flag or
  block type that no menu can add.
- A dashboard that changes appearance or loses a widget when it is converted or first
  edited.
- A template instance that writes into another instance's database or into the demo
  seed.
- A warm-chunk regression: the template clone and the seed state stay out of the warm
  chunk (dynamic import), and the adapter is measured on the perf harness.

## Phases (each merges to develop and main with CI green, then ships live)

| Phase | Scope | Main files | Done when |
|---|---|---|---|
| R1 | Templates own their databases; Use template from Home | new `widgets/database-view/model/templateDatabaseClone.ts`; `store/pageStore.actions.ts` (`createCreatePageFromTemplate`); the Home template peek | canvas test: two instances get distinct `db-*` ids, schema, views and rows are cloned, in-database relations are remapped, nested layout cells are rewritten, the seed is untouched. e2e: Use "Student Dashboard" from Home → the new page's database id is not `db-tasks`; a row added there survives a reload and is absent from a second instance |
| R2 | One dashboard model | engine `dashboard/notion/model/legacyWidgets.ts` (`legacyWidgetsToRows`), the chart widget config plus the engine settings seam, `DashboardView.tsx` (legacy grid and "Customize layout" CTA removed), `AddWidgetPicker.tsx` (every number property, min/max) | canvas test: a round trip for every seeded and preset legacy dashboard (same widget count, same KPI values, same chart property). e2e: Store Stats renders through `DashboardNotionView`, an edit persists, nothing is lost. Before/after screenshots |
| R2b | Formula and relation analytics as widget presentations | engine `FormulaAnalyticsDashboard`, `RelationRollupDashboard`, the widget frame menu | both seed views render as a dashboard whose widgets a user can add from the picker |
| R3 | Account Home | `databaseViewCatalog.ts` (`HOME_SECTIONS`, a new `HOME_DASHBOARD_VERSION`), `sysDataSources.ts` built-in views, Recents/Templates in the `/` "My data" group, `bridge-self-views.mjs` (`dashboard` type), `MainContent.tsx` (regeneration must not overwrite user edits) | every Home block's type and source can be inserted from `/`; tiles count real records (tested against the bridge fixture); a dashboard view saved on `sys:my-tasks` round-trips through the bridge |

## Decisions I made (the owner can overrule them)

- **Clones copy rows, not only schema and views.** A template database with zero rows
  makes the template's dashboard render empty. The copied rows belong to the user, who
  can delete them.
- **Read-time conversion, as the 2026-10-26 design chose.** Stored legacy dashboards of
  existing users convert on open, which needs no migration.
- **A KPI tile's backing view is the dashboard view itself.** A legacy stat widget
  becomes a widget whose `viewId` is the host dashboard view, so the tile covers the
  same records it covered before. No hidden backing views are created.
- **Order: R1, then R2, then R3.** R1 fixes what is broken. R2 is what makes every
  shipped dashboard reproducible. R3 builds on both.

## What shipped, and what it found (2026-10-27)

- **R2b.** `DashboardViewWidget.insight` (`formulas` | `relations`) is a fourth
  presentation. `layoutFromSettings` converts the old `formulaAnalytics` and
  `relationAnalytics` flags to one insight widget over the host view. The picker
  and the widget menu offer "Formula health" when the database has a formula
  column, and "Relations & rollups" when it has a relation or rollup column.
- **R3a.** `sys:` sources carry editable built-in views; a user's edit is saved under
  the built-in's own id.
- **R3b.** Home is now: the greeting; a row of three `/button` blocks (New page,
  Preferences, Edit profile); Your tasks, Your pages, Your people and Your workspaces;
  then Recently visited and Templates. Each of the four "Your" sections is a `sys:`
  database on its starter dashboard (`sysHomeDashboards.ts`). Learn, Upcoming events
  and Home views have left the seed. `HOME_DASHBOARD_VERSION` is 12.
- **Found while building R3b: select filters compared different forms.** Seeded
  databases store option ids in select cells. `sys:` and workspace databases store
  the option's text, while the filter UI stores the id. A Status = accepted tile on
  `sys:my-connections` therefore counted 0. `matchesPropertyFilter` maps both sides
  to the option id, and view filters, dashboard filters, stat filters and
  conditional colours all use it. Automation conditions (`ruleMatch.ts`) still
  compare raw values, because a rule has no schema at hand.
- **Found while building R3b: the widget menu drifted from the picker.** The menu
  listed 5 charts and 3 "Top by" lists, while the picker listed every column, so
  "Next due" could not be rebuilt. `chartEntries` and `recordEntries` are now the
  single list for both. Records also gain "Earliest" and "Latest" by any date
  column, with undated rows last.

## Left to the builder

- The file split under `dashboard/notion/` (300 lines or fewer per file) and the chart
  settings-override prop shape.
- How the Home template peek shows "Use template": a header button in the peek, or a
  card action.

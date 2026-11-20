# Template dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shells as canvas regions, a lazy catalogue of 16 dashboard templates, safe apply with keep-copy, a Templates panel and gallery cards that create a page from a template.

**Architecture:** Regions are optional fields on the existing `layout` block's cells, read first (T1a) and written one promotion later (T1b). Templates are `SeedPage`s with an input slice of example databases, loaded by dynamic import and cloned into the store only on use. Apply goes through the target page editor's `commitContent` (one undo step).

**Tech Stack:** React + TypeScript, zustand stores, canvas runner (`tests/canvas/*.test.ts`), Playwright e2e (`tests/e2e/functional/*.spec.mjs`), database kit submodule `src/shared/notion-database-sys`.

**Spec:** `docs/superpowers/specs/2026-11-20-template-dashboards-design.md` + ruling `docs/superpowers/specs/2026-11-20-template-dashboards-ruling.md` (TD1–TD24). Executors read both.

## Global Constraints

- Worktree `/mnt/storage/dlesieur/wt/osionos-tpl`, branch `feat/template-dashboards`; first run `bash ~/.claude/tools/osionos/sub-local.sh /mnt/storage/dlesieur/wt/osionos-tpl` (a missing pin: `git fetch origin` inside that submodule, then checkout the pin).
- Gates only in docker: `W=<wt> bash /mnt/storage/dlesieur/scratch/integ/gates.sh <tag>`; e2e: `W=<wt> T=900 bash <scratchpad>/e2e-wt.sh <spec> [-g pattern]`.
- Files < 300 lines, functions ≤ 25 lines, new files carry the 42 header (`bash ~/.claude/tools/osionos/hdr42.sh <FILE>`), every heuristic/cache carries a `Caveat:` line.
- Commits without trailers; never push, never stash (the orchestrator lands).
- Region values are fixed enums: `region ∈ {header,left,main,right,footer}`, `stackAt ∈ {tablet,mobile,never}`, `sticky` boolean, honoured on `left`/`right` only. Unknown = absent (TD19). DOM sees them only as `data-region`, `data-stack-at`, `data-sticky`.
- Mobile stacking order: header, main, left, right, footer.
- A `tpl:` id never reaches `usePageStore`, the page cache, recents, favorites, duplicate or any bridge call (TD17).
- Catalogue modules are reachable only by dynamic `import()` (TD22); catalogue databases never enter the store except as fresh clones (TD8–TD10).
- Replacing a page from an app action is BLOCKED (TD14): `template.apply` only creates a page.
- `cardClick` is NOT added to the Library or `sys:` view allowlists (TD15, TD16).
- Example data is fictional; no real people.

## Review Focus

1. A page saved by T1b's writer opened by a client without T1a: cells keep their region fields through migrate→unmigrate on the T1a build (pinned in Task 1).
2. Apply on a page whose database body is not loaded yet: refuse with no write (Task 5 abort test).
3. Undo right after apply restores content, cover and icon, and leaves database ids = old + clones (Task 6 e2e).
4. Two applies of the same template share no database id (Task 8 test).
5. A narrow window (400 px) with a two-sidebar shell: sidebars stack below main, nothing overflows horizontally (Task 4 e2e).

---

## Phase T1a — readers (ships one promotion before T1b)

### Task 1: Region fields survive the canvas model

**Files:**
- Create: `src/entities/block/model/layoutRegion.ts`
- Modify: `src/entities/block/model/types.ts:103` (`LayoutCell` gains the 3 fields, importing the types from `layoutRegion.ts`)
- Modify: `src/features/block-editor/ui/canvas/layout.types.ts:38` (its `LayoutCell` gains the same 3 fields from the same import)
- Modify: `src/features/block-editor/ui/canvas/model/types.ts:62` (`CanvasCell` gains them)
- Modify: `src/features/block-editor/ui/canvas/model/migration.ts:60-93,121-138`
- Test: `tests/canvas/layout-region.test.ts`

**Interfaces:**
- Produces: `type LayoutRegion = "header"|"left"|"main"|"right"|"footer"`; `type RegionStackAt = "tablet"|"mobile"|"never"`; `normalizeRegion(value: unknown): LayoutRegion | undefined`; `normalizeStackAt(value: unknown): RegionStackAt | undefined`; `normalizeSticky(value: unknown, region: LayoutRegion | undefined): true | undefined` (true only for `true` on `left`/`right`); `regionAttributes(cell: { region?: unknown; stackAt?: unknown; sticky?: unknown }): Record<"data-region"|"data-stack-at"|"data-sticky", string | undefined>`.

- [ ] **Step 1: Write the failing tests** — `normalizeRegion("left") === "left"`, `normalizeRegion("sidebar") === undefined`, `normalizeRegion(1) === undefined`; `normalizeSticky(true,"main") === undefined`, `normalizeSticky(true,"right") === true`; `unmigrate(migrate(cell,cfg),cfg)` keeps `{region:"left",stackAt:"mobile",sticky:true}`; a cell with `{region:"x",stackAt:"y",sticky:"yes"}` comes back with none of the three keys; `regionAttributes({region:"left",sticky:true})` → `{"data-region":"left","data-stack-at":undefined,"data-sticky":"true"}`; the `osilayout` markdown fence and `pageToFile`→`fileToPage` round-trip a layout block carrying the fields unchanged.
- [ ] **Step 2: Run** `W=… RAW=1 bash …/osionos.sh npx tsx tests/canvas/layout-region.test.ts` — expect FAIL (module not found).
- [ ] **Step 3: Implement** `layoutRegion.ts`; `migrate`/`unmigrate` copy the normalized fields beside `section` (absent when undefined, via the existing `pruneUndefined`).
- [ ] **Step 4: Run** the test — PASS; also `tests/canvas/canvas-migration.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(canvas): layout cells read region, stackAt and sticky`.

### Task 2: Both cell renderers expose regions; CSS stacks and sticks

**Files:**
- Modify: `src/entities/block/ui/LayoutBlockReadOnly.tsx:64-75` (spread `regionAttributes(cell)` on the cell div)
- Modify: `src/features/block-editor/ui/canvas/view/CanvasCellView.tsx:124-135` (same spread on `<section>`)
- Modify: the stylesheet that holds `.osionos-layout-cell` (find with `rg -l "osionos-layout-cell" src --glob '*.css'`)
- Test: `tests/canvas/layout-region-dom.test.ts` (pattern of `tests/canvas/block-layout-dom.test.ts`)

**Interfaces:** Consumes `regionAttributes` (Task 1).

- [ ] **Step 1: Failing test** — rendering a read-only layout with a `left`+`sticky` cell yields `data-region="left"` and `data-sticky="true"`; a cell with `region:"bogus"` has no `data-region` attribute.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the spreads and CSS: a container query on the layout grid; below 48rem (`tablet`) or 30rem (`mobile`) a cell with that `data-stack-at` spans all columns, and `order` follows header 0, main 1, left 2, right 3, footer 4; `[data-sticky="true"]` gets `position: sticky; top: var(--osio-topbar-height, 0); align-self: start` above the stack width only.
- [ ] **Step 4: Run** the test + `gates.sh t1a` — all green.
- [ ] **Step 5: Commit** `feat(canvas): cells render their region, collapse and stick`. **Land T1a on develop; beta.**

## Phase T1b — writers

### Task 3: Cell menu writes regions

**Files:** Modify `src/features/block-editor/ui/canvas/view/CanvasInspector.tsx` (or the cell context menu next to `measuredHeight` actions; < 300 lines — extract `CellRegionControls.tsx` if needed), the reducer action in `canvas/model/canvasReducer.ts`. Test: `tests/canvas/layout-region-reducer.test.ts`.

**Interfaces:** Produces reducer action `{ type: "setCellRegion"; cellId: string; region?: LayoutRegion; stackAt?: RegionStackAt; sticky?: boolean }`, values passed through the Task 1 normalizers.

- [ ] Failing test: dispatching `setCellRegion` with `sticky:true` on a `main` cell stores no `sticky`; with `region:"left",sticky:true` stores both.
- [ ] Implement controls "Region", "Collapse below", "Stick while scrolling" (last one disabled unless left/right) and the action. Test passes. Commit `feat(canvas): cell menu sets region, collapse and stick`.

### Task 4: `/` page shells

**Files:** Create `src/features/slash-commands/model/pageShellBlocks.ts` (builders `pageShellLayout(kind: "two-sidebars"|"left-sidebar"|"right-sidebar"|"header-footer"): Block`); register 4 items in a new group next to `slashMenuCatalog.tsx` (that file is near 300 lines; add a sibling file). Test: `tests/canvas/page-shell-blocks.test.ts`, e2e `tests/e2e/functional/pageShells.spec.mjs`.

- [ ] Failing canvas test: each kind gives a `layout` block with `layoutMode:"full_page"` and the expected region set (two-sidebars: header,left,main,right,footer); sidebars `stackAt:"tablet"`, `sticky:true`.
- [ ] Implement; canvas test passes.
- [ ] e2e: insert "Two sidebars" from `/`; at 1440×900 the left cell's `position` is `sticky`; at 400×800 left's top > main's bottom and `document.documentElement.scrollWidth <= 400`.
- [ ] Commit `feat(slash): page shells insert a full-page layout with regions`. Land T1b; beta.

## Phase T2 — apply

### Task 5: Apply engine (pure)

**Files:** Create `src/features/templates/model/applyTemplate.ts`, `src/features/templates/model/templateSlice.ts`. Test: `tests/canvas/apply-template.test.ts`.

**Interfaces:**
- `interface TemplateSource { id: string; title: string; content: Block[]; databases: Pick<NotionState,"databases"|"views"|"pages"> }`
- `cloneFromSlice(content: Block[], slice: TemplateSource["databases"], live: NotionState, mintId: (p: string) => string): { content: Block[]; state: NotionState; created: CreatedEntry[] }` — runs `cloneTemplateDatabases` (`templateDatabaseClone.ts:256`) on `live` merged with `slice`, then removes every slice id from the returned state, so the result = live + clones (TD9).
- `planApply(input: { target: PageEntry; template: TemplateSource; live: NotionState; canEdit: boolean; dbWritable: boolean; mintId }): { ok: true; content: Block[]; state: NotionState } | { ok: false; reason: "read-only"|"not-loaded"|"db-read-only"|"dangling-database" }`.

- [ ] Failing tests: database ids after = before ∪ created, none removed (TD9, TD11); row counts of existing databases unchanged; a template block pointing at an id in neither slice nor live → `dangling-database` (TD10); `canEdit:false` → `read-only`; every block id in the result differs from the template's (TD7).
- [ ] Implement; tests pass. Commit `feat(templates): pure apply plan clones template databases from an input slice`.

### Task 6: Apply on the open page, keep-copy dialog, version

**Files:** Create `src/features/templates/model/applyToPage.ts`, `src/features/templates/ui/ApplyTemplateDialog.tsx`. Modify `src/features/page-shells/model/applyShell.ts` (reuse `applyTemplateBlocks`' target shape). Test: `tests/canvas/apply-to-page.test.ts`, e2e `tests/e2e/functional/templateApply.spec.mjs`.

**Interfaces:** `applyToPage(pageId: string, template: TemplateSource, mode: "keep-copy"|"replace", userId: string): Promise<ApplyOutcome>` (`ApplyOutcome` = `{ ok: true; copyId: string | null; versionSaved: boolean } | { ok: false; reason: ApplyFailure; copyId?: string }` — a failure after the copy step carries the copy's id so the dialog can say it was kept) — finds the page editor handle by `pageId` + `kind:"page"` (TD1); order gate → copy → clone → `saveAutosaveVersion(pageId, userId, "Before template: <title>", addVersion)` → `commitContent` (TD2–TD5). Keep-copy copies the root page from loaded content only, no navigation, `activePage` and recents unchanged (TD13).

- [ ] Failing canvas tests: each abort reason performs 0 store writes and 0 bridge calls (spy); keep-copy failure aborts before commit.
- [ ] Implement; dialog buttons in order *Keep a copy and apply* (default focus), *Replace* (destructive style), *Cancel*. Pages with no content skip the dialog.
- [ ] e2e: page with a database → apply with keep-copy → copy exists in the sidebar, URL unchanged, database ids = old + clones; Ctrl+Z restores content, cover and icon.
- [ ] Commit `feat(templates): apply a template to the open page after asking`.

> **Split (2026-11-20).** 6a, the model with its canvas tests, shipped as 78f1c872a. The dialog, its e2e and the TD4 one-undo proof (6b) move into Task 11, because the panel's "Apply to this page" button is the dialog's only entry point. Until then the dialog cannot be reached and would ship as dead code. T2 does not reach develop on its own; it lands together with T4, as the ruling requires TD1–TD14 before develop.

### Task 7: `template.apply` app action, create-only

**Files:** Modify `src/features/app-actions/model/actionRegistry.ts` (new entry). Test: `tests/canvas/template-apply-action.test.ts`.

- [ ] Failing test: the definition has `params` `{ templateId: { type:"string", required:true } }` only, `confirm:"simple"`; passing a `pageId` arg does not touch that page; `run` calls `createPageFromTemplate`.
- [ ] Implement; pass; commit `feat(app-actions): template.apply creates a page from a template`. T2 lands with T4 (see the Task 6 split).

## Phase T3 — catalogue

### Task 8: Catalogue — split into 8a / 8b / 8c (2026-11-20)

The gallery peek reads `pageById` (`WorkspaceDatabaseBlock.tsx:49`), so a `tpl:` card would open "Page unavailable" and its "Use template" would reach `createPageFromTemplate` (`pageStore.actions.ts:788`) unguarded. The data and the UI land separately.

#### Task 8a: `tpl:` guard (TD17) — done, 643646ecf

`catalogue/tplId.ts` `isCatalogueId`; guards in `openPage`, `patchPage`, archive/duplicate/restore/delete, favorites `toggle`, `savePagesCache` (`withoutCatalogueEntries`), and the outbox. The outbox answers `"ok"` with version null for a `tpl:` page: `"gone"` would take the copy-recovery path and POST a copy. Test: `tests/canvas/tpl-guard.test.ts`.

#### Task 8b: builders + lazy loader + entry-graph test (TD22 source half)

**Files:** Create `src/data/templates/catalogue/build/{regions,views,cards,databases}.ts`, `catalogue/types.ts` (`CatalogueCategory`, `CatalogueCard`, `CatalogueTemplate`), `catalogue/index.ts` (`listCatalogue`, `loadTemplate`, an empty `ENTRIES` that Task 9 fills with `import()` loaders). Tests: `tests/canvas/catalogue-builders.test.ts`, `tests/canvas/catalogue-entry-graph.test.ts`. Contract: `scratch/tpl/task8b-contract.md`.

- [ ] Failing tests: `regionPage` fills only named regions without mutating the shell; `tileRow` rejects 0 or > 4 tiles; `database()` rejects a foreign `databaseId`; `mergeSlices` rejects duplicate keys; a built example passes `planApply`; a static-import walk from `src/app/main.tsx` reaches no `catalogue/` file except `tplId.ts`.
- [ ] Implement; pass; commit `feat(templates): catalogue builders and lazy loader (TD22 source half)`.

#### Task 8c: gallery merge + `tpl:` peek (TD22 manifest half)

**Files:** Modify `templatesDatabaseState.ts:37` (catalogue cards with a "Shipped" badge, read-only, `category`), the Templates peek (`DatabaseBlock.tsx:174-190` → render `loadTemplate(id)` when `isCatalogueId`), "Use template" → `template.apply` (Task 7); guard `createPageFromTemplate` for `tpl:` ids. Enable a vite build manifest and check it (TD22).

- [ ] Failing tests: a `tpl:` card opens a read-only preview, not "Page unavailable"; "Use template" on it creates one page with fresh database ids; the build manifest puts every `catalogue/<slug>` module in a chunk not imported by the entry chunk.
- [ ] Implement; pass; commit `feat(templates): shipped templates in the gallery`.

The "builders output only block types and views reachable from `/`, the view menu or Add widget" check moves to Task 9's table test, where the content exists.

### Task 9: 16 templates (split into 4 commits of 4)

**Files:** `src/data/templates/catalogue/<slug>.ts` for: project-tracker, sprint-board, crm-pipeline, content-calendar, habit-tracker, reading-list, student-semester, personal-finance, team-wiki-home, product-roadmap, event-planner, job-search, okrs, support-desk, inventory, travel-planner. Test: `tests/canvas/catalogue-templates.test.ts`.

- [ ] Failing test (table over all 16): every block type and view type is reachable from `/`, the view menu or "Add widget"; ≥ 2 regions, ≥ 1 database with ≥ 3 views, ≥ 1 dashboard tile row; nesting depth ≤ 8 (TD21); round-trips markdown and `.omd` unchanged; two `planApply` runs share no database id; records each template's database byte size to `tests/canvas/__artifacts__/catalogue-bytes.json` (TD12).
- [ ] Implement 4 at a time, test green after each; commits `feat(templates): <names> templates`.

### Task 10: Retire the old shell catalogue

**Files:** Delete `src/data/templates/shells/` and `src/data/templates/sections/` shells that now exist as catalogue templates; re-point `applyShell` callers to `loadTemplate`. Tests: existing shell tests updated to the catalogue ids, nothing else changed.

- [ ] `gates.sh t3` green; commit `refactor(templates): shells move into the catalogue`. Land T3; beta.

## Phase T4 — Templates panel

### Task 11: Panel

**Files:** Create `src/widgets/templates-panel/ui/{TemplatesPanel,TemplateCard,TemplatePreview}.tsx`, `src/widgets/templates-panel/model/previewCache.ts` (LRU of 24 rendered previews, with `Caveat:` — stale after a catalogue update within one session). Register `templates` in `shared/config/uiStore.ts:20` and `widgets/activity-rail/ui/panelLoaders.ts` (lazy). e2e `tests/e2e/functional/templatesPanel.spec.mjs`.

- [ ] Failing e2e: open panel, search "crm" → 1 card; arrow keys move focus; Enter opens preview; `A` applies (dialog appears when the page has content); "Apply to this page" disabled on a read-only page; axe AA passes in light and dark.
- [ ] Implement; previews render only on hover/focus (TD24); e2e green.
- [ ] From Task 6: `ApplyTemplateDialog.tsx` (own component; the kit `ConfirmDialog` has 2 buttons and no dialog role), and `templateApply.spec.mjs` (keep-copy → copy in the sidebar, URL unchanged, `activePage` and recents unchanged; the copy reaches the bridge, not a local-only id; Ctrl+Z restores content, cover and icon; a page in two panes still applies after closing one). This e2e is the live-wiring proof for `applyToPageLive.ts` (flows review 2026-11-20).
- [ ] Perf: `boot-ab.sh` ABBA warm and cold within the ADR 0066 baseline (TD23); record the numbers in the commit body.
- [ ] Commit `feat(templates): Templates panel with live previews`. Land T4; beta.

## Phase T5 — gallery card click

### Task 12: `cardClick` (kit submodule + app)

**Files:** In submodule `src/shared/notion-database-sys`: `packages/contract-types/src/index.ts` (`ViewSettings.cardClick?: "open" | "use_template"`), `CardBody.tsx` (calls an injected `onUseTemplate(pageId)` when set to `use_template`, else `openPage`), view settings menu item "Open pages in". App: wire `onUseTemplate` to `createPageFromTemplate` + open; `tests/canvas/library-views-shape-parity.test.ts:27` adds `"cardClick"` to `EXCLUDED_SETTINGS`. e2e `tests/e2e/functional/galleryUseTemplate.spec.mjs`.

- [ ] Failing e2e: Templates gallery card click creates and opens a new page; the hosting page's content is unchanged; a view without `cardClick` opens the page as today.
- [ ] Implement; the submodule commit is pushed to its own remote before the app pins it (unpushed-pin rule); bridge allowlists untouched (TD15/TD16).
- [ ] Commit `feat(views): gallery cards can create a page from a template`. Land T5; beta.

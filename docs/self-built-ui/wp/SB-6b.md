# SB-6b — The grid canvas, upgraded: fine rows and a narrow layout per cell (self-built UI, phase S6) 👹

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §4 "Layout: the grid canvas", upgrades 1–3). The canvas `layout` block is the page skeleton the design promotes for system pages. Two of its limits stop it from holding settings: a row is at least 96 px, so a 44 px setting row cannot be one cell, and below 768 px of **viewport** every canvas collapses to one column in DOM order, whatever the pane's width. This package lowers the row unit to 8 px and gives each cell a narrow-layout position that follows the **pane** width. Upgrade 4 (the component tray) moves to SB-6e, which owns the library it shows.

👹 because it changes the renderer of every existing canvas (profile pages, READMEs, dashboards, the Insights template) and a fine-row canvas opened in the legacy V1 editor would be rewritten to 96 px rows (Rule 2).

Base: the integration tip with SB-6a merged.

## What exists (read these first)

- Canvas V2 is the default editor (`isCanvasV2Enabled`, `featureFlags.ts:49-55`); V1 (`LayoutBlockEditor.tsx`) stays reachable with `?osio.canvas.v2=0`.
- Both persist the same legacy `layoutCells` (`colStart/colSpan/rowStart/rowSpan`, `offset`) and `layoutConfig` (`entities/block/model/types.ts`); V2 converts with `migration.ts` (`migrate`, `unmigrate`, `gridCellFromFrame`, `gridConfigFromLegacy`).
- Row limits live in three places: `LAYOUT_CONFIG_LIMITS.rowHeight [96, 320]` and `CELL_MIN_ROW_HEIGHT = 96` (`layout.constants.ts:37-45`, used by V1's `sanitizeLayoutConfig` and `clampLayoutCell`, `layout.helpers.ts:157-200`), and V2's settings panel hardcodes `min={96} max={320}` (`view/CanvasSettingsPanel.tsx:45`).
- Growth: V2 pushes neighbours down at render time (`resolveHugDisplacements`, `model/collision.ts`; `useHugHeights`, `controller/useHugHeights.ts`; `CanvasStage.tsx:57-79`). The read-only renderer (`entities/block/ui/LayoutBlockReadOnly.tsx`) is a CSS grid with `grid-auto-rows: minmax(<rowHeight>px, auto)`, so rows grow with content.
- Narrow: `notionPage.css:1087-1128`, `@media (max-width: 768px)` turns `.osionos-layout-grid` into a flex column. V2's stage only scales horizontally (`resolveLayout.ts`, `useCanvasScale.ts`).
- Tests that pin canvases today: `rg -l "osionos-layout-grid|data-layout-grid|canvas" tests/e2e/functional` and `tests/canvas/*canvas*.test.ts`, `tests/canvas/hug-height-persistence.test.ts`.

**OWNS:**
- `layout.constants.ts` (modified): `CANVAS_ROW_HEIGHT_LIMITS = [8, 320]`, `NARROW_LAYOUT_MAX_WIDTH = 720`;
- `view/CanvasSettingsPanel.tsx` (modified): reads `CANVAS_ROW_HEIGHT_LIMITS`; the hardcoded pair goes;
- `entities/block/model/types.ts` and `canvas/model/types.ts` (modified): `narrowOrder?: number` on `LayoutCell` and `CanvasCell`; `migration.ts` carries it both ways and drops a value that is not a finite integer ≥ 0;
- `canvas/model/narrowOrder.ts` (new): `readingOrder(cells)` and `narrowSequence(cells)` (Interfaces);
- the reducer (modified): `{ type: "setNarrowOrder"; ids: string[] }`, persisted, with undo;
- `view/CanvasStage.tsx` (modified) and `view/CanvasNarrowStack.tsx` (new): Edit at narrow width (Rule 5);
- `entities/block/ui/LayoutBlockReadOnly.tsx` (modified): the container query and `order` (Rule 4);
- `notionPage.css` (modified): the `.osionos-layout-grid` and `.osionos-layout-cell` rules move from the 768 px media query to a container query; the panel and inspector rules in that block stay where they are;
- `LayoutBlockEditor.tsx` (modified): Rule 2's guard only;
- `layout.helpers.ts` (modified): `layoutCellShellEqual` only; `AgentConversationPage.tsx` (modified): `layoutCellsFromUnknown` only; `collision.ts` (modified) only if Rule 8 needs it;
- tests: `tests/canvas/canvas-fine-rows.test.ts`, `tests/e2e/perf/canvasFineRows.spec.mjs` (Rule 8, `PLAYWRIGHT_PERF=1`), `tests/e2e/functional/canvasNarrow.spec.mjs`, `tests/e2e/functional/canvasGeometry.spec.mjs` + `tests/e2e/functional/canvasGeometry.golden.json` (new).

**MUST NOT TOUCH:** `resolveHugDisplacements` and `useHugHeights` (call them), `sanitizeLayoutConfig` and `clampLayoutCell` (V1's clamps stay; Rule 2 keeps V1 from writing), the shipped templates' cell data, the vendored tree.

**Commit messages:** the golden file first, alone: `test(canvas): geometry of the shipped canvases before the grid upgrade`; then `feat(canvas): 8 px rows and a narrow layout that follows the pane width`.

## Interfaces

```ts
// narrowOrder.ts
function readingOrder(cells: readonly LayoutCell[]): string[];   // ids by rowStart, then colStart, then array index
function narrowSequence(cells: readonly LayoutCell[]): string[]; // cells with narrowOrder first (ascending, ties by reading order), then the rest in reading order
```

Devil conditions (D-SB-6b-spec, 02:06, PROCEED-WITH-CONDITIONS, blast 5) are folded into Rules 1, 2, 4–8 below.

## Rules (each one is tested)

1. **Fine rows.** In V2, a canvas may set `rowHeight` from 8 to 320 px; the V2 settings panel offers that range from `CANVAS_ROW_HEIGHT_LIMITS` (V1's panel stays 96–320, `LayoutBlockEditor.tsx:850`); snapping, resize and new cells use `rowHeight + rowGap` as today, so `rowHeight: 8, rowGap: 0` gives an 8 px grid and a 1-row cell is 8 px tall (V2 never calls `clampLayoutCell` or `CELL_MIN_ROW_HEIGHT`; confirm with `rg` and paste it). Existing canvases are not migrated: a stored `rowHeight` of 96 or more renders exactly as before. The guides are unchanged: they draw 20 px dots from `--osionos-layout-dot-size` (`notionPage.css:398-410`); `--osionos-layout-row-size` is set in three places and read by no CSS, so it stays as it is (test: an 8 px canvas's guide `background-size` is 20 px). No DOM node is created per row (test: the stage's descendant count is the same for 100 and 4,000 rows of content height).
2. **V1 never rewrites a fine grid.** V1 can represent `rowHeight` ≥ 96 only (`sanitizeLayoutConfig`). When the **raw stored** value (before any sanitising) is below 96, `LayoutBlockEditor` returns, before any handler or store is created, the canvas through `LayoutBlockReadOnly` with the notice "This canvas uses a finer grid. Turn on Canvas V2 to edit it.", so no V1 write path is reachable: `updateConfig`, `updateCells`, `addCell`, `applyTemplate`, `updateCell`, undo/redo, the layout-mode switch, and the write on unmount. This changes one shipped behaviour, and the report names it: a stored canvas below 96 px (the earlier Home dashboard, `createHomeLayout`, 56 px; uncalled today but present in stored pages) is read-only in V1, where today V1 opens it and rewrites it to 96 px. Tests: open an 8 px canvas and a 56 px Home dashboard with `?osio.canvas.v2=0`; try a cell drag, a settings change and undo; close the page; the stored `layoutConfig` and `layoutCells` are byte-identical and no write request was sent.
3. **Growth is unchanged, and the difference is written down.** View keeps the CSS grid (rows grow with content, never clip); Edit keeps the render-time push-down. With side-by-side cells they differ: a growing cell in View grows every row it spans, so cells in other columns that share those rows move too; in Edit only the cells below it in its own column move. Add a `Caveat:` saying so above `LayoutBlockReadOnly`, and a canvas test that pins both results for one two-column fixture, so a later unification is a visible change.
4. **The narrow layout follows the pane.** The read-only grid sits in a wrapper with `container-type: inline-size` and `display: block; width: 100%; min-width: 0`, so it cannot collapse in a shrink-to-fit parent (the `SettingsView.tsx:99-111` bug class). The read-only renderer emits the cells **in `narrowSequence` order in the DOM**; at wide widths every cell keeps its explicit `grid-column`/`grid-row`, so its position does not depend on DOM order, and at `NARROW_LAYOUT_MAX_WIDTH` (720 px, the settings breakpoint, `SettingsView.tsx:116`) or less the grid becomes one column in DOM order. No `style.order`: visual order, Tab order and screen-reader order are the same sequence (WCAG 1.3.2, 2.4.3). The 768 px viewport rule no longer applies to the grid or its cells. Tests at a 1,440 px viewport: a 600 px split pane stacks, a 1,000 px pane does not; at a 375 px viewport it stacks; inside a table cell and inside a flex column at 375 px the wrapper is the parent's full width; for a fixture whose `narrowOrder` differs from its array order, Tab at 375 px visits the cells in the visual order.
5. **Edit at narrow width.** When V2's stage is at most 720 px wide, it shows `CanvasNarrowStack`: the cells at full width in `narrowSequence`, each at its frame height or measured hug height, with a drag handle and the keyboard commands Alt+ArrowUp / Alt+ArrowDown on a focused cell, both dispatching `setNarrowOrder` with the full new id order. Frame move, resize and the stage keyboard handler (`useCanvasKeyboard`, whose Alt+Arrow is the fine nudge) are not mounted in this view, so one key press does one thing. A line above the stack says "Narrow layout: drag to reorder. Widen the pane to edit the grid." Undo restores the previous order. A pane resize across 720 px during a frame drag ends the drag without committing a frame (test: start a move, narrow the pane, release; no `updateCellFrames` and no error). Tests: reorder two cells by keyboard, reload, and the read-only render at 375 px shows the new order while the 1,440 px layout is unchanged; Alt+ArrowDown in the stack changes `narrowOrder` and no frame.
6. **Existing canvases look the same.** Step 1 records, on the base commit, the bounding box of every cell (relative to the grid, rounded to 1 px), read-only, at 1,440 and 375 px, into the golden file, committed alone before any other change, for: each `CANVAS_TEMPLATES` kind, the Insights template, `src/__fixtures__/legacy-layout.json`, `createHomeLayout` (56 px), the profile header preset (`profileHeaderPreset.ts:101-113`), `seedPages.ts:83`, `templateBlocks.ts:94` and the output of `turnIntoDashboard` (`turnIntoDashboard.ts:42-53`) on a three-block page. Where two cells overlap, the golden also records which cell is on top at the overlap's centre (`elementFromPoint`), because DOM order now follows `narrowSequence` and sets paint order; a changed top cell fails the test. After the change: identical at 1,440 px; at 375 px the same boxes in reading order. List in the report every fixture whose 375 px order changed because its DOM order was not its reading order.
7. **`narrowOrder` survives every path a cell takes.** `migrate` and `unmigrate` carry it both ways (`unmigrate` adds it explicitly, since `gridCellFromFrame` returns a `Pick` without it, `migration.ts:183-190`) and drop a value that is not a finite integer ≥ 0. It survives a raw-mode save through the `osilayout` fence and `blockOverlay` (a page-file codec round-trip test), a sync merge (`mergePageContent.blocks.ts:238-245` spreads cells; a test pins it), and an MCP import (`AgentConversationPage.tsx:191-204` rebuilds cells field by field; add `narrowOrder` there). `layoutCellShellEqual` (`layout.helpers.ts:444-463`) compares it. `setNarrowOrder` applies only when `ids` is exactly the current cell id set (no drop, duplicate or unknown id), else it is a no-op; it is in `PERSISTABLE_ACTIONS` (`canvasReducer.ts:25-29`) and undoable.
8. **Fine rows stay fast.** On an 8 px canvas 4,000 rows tall with 50 cells, in V2: adding a cell and moving a cell each cost app p95 ≤ 16 ms (p95 minus the floor median, 20 runs, the `interactions.spec.mjs` method), because `resolveOverlapsByPushDown` (`collision.ts:22-51`) runs on every move. Paste both numbers. If either is over, make the V2 path fit (for example, index cells by column span instead of the `find` per iteration) and paste the before and after; V1's `findLayoutPlacement` is out of scope (V1 never edits a fine grid, Rule 2).
9. **A settings section fits the grid.** The SB-1e styleguide demo document placed in one hug cell spanning all 12 columns of an 8 px grid (`rowGap: 0`) renders its children at the same offsets and heights (±1 px) as `SystemPageHost` renders them, at 1,440 px, light and dark; at 375 px it stacks with no horizontal scroll.

## Steps

- [ ] **Step 1: The golden.** Write `canvasGeometry.spec.mjs` with a `RECORD=1` mode that writes the golden file; run it on the base commit; commit the golden file alone with its message. The spec in normal mode then compares against it.
- [ ] **Step 2: Failing tests.** Canvas (`canvas-fine-rows.test.ts`): `readingOrder` and `narrowSequence` (ties, gaps, unknown values), Rule 7's paths (migrate/unmigrate, the page-file codec, the sync merge, the MCP import, `layoutCellShellEqual`, `setNarrowOrder`'s id-set check and undo), Rule 3's fixture. e2e (`canvasNarrow.spec.mjs`): Rules 1, 2, 4, 5 and 9; perf (`canvasFineRows.spec.mjs`): Rule 8.
- [ ] **Step 3: Run them and see them fail.** `npm run test:canvas -- tests/canvas/canvas-fine-rows.test.ts`; `PW_BROWSER_SOURCE=system bash scripts/docker-run.sh test-e2e tests/e2e/functional/canvasNarrow.spec.mjs tests/e2e/functional/canvasGeometry.spec.mjs`.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) the read-only grid keeps the 768 px viewport rule;
  - (b) V1 writes an 8 px canvas back with `rowHeight: 96`;
  - (c) `narrowSequence` ignores `narrowOrder`;
  - (d) `unmigrate` drops `narrowOrder`;
  - (e) the read-only renderer emits cells in array order and sets `style.order` instead;
  - (f) `setNarrowOrder` accepts an id list missing one cell.
- [ ] **Step 6: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; the new e2e green; every canvas e2e you listed under "What exists" unchanged and green (name them). Report each.
- [ ] **Step 7: Commit** with the second message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the golden commit's SHA and the implementation SHA, the fixtures whose 375 px order changed, the mutant results. A gate you could not run is SKIPPED with the reason.

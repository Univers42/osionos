# SB-6c — Select, inspect, move: the block inspector generated from schemas (self-built UI, phase S6)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §8 "Editing (Figma-grade)" and §11). In Edit, an author selects a block, sees where it sits (its frame ancestors), changes its style and props in a side panel, and moves it inside a frame, across frames, or out of one, by mouse and by keyboard. The panel is generated: style controls come from `STYLE_SCALES`/`PROP_SCALE`, prop controls from each block's registry definition, so a new scale value or a new block appears in the inspector with no inspector change. The preset group (apply, detach, save as preset) belongs to SB-6e, with the library it saves into.

Base: the integration tip with SB-6a, SB-1b and SB-1c merged.

## What exists (read these first)

- **Selection:** `src/features/block-editor/model/blockSelectionStore.ts` (`useBlockSelection`: ids per surface `sourceKey`, `select`, `toggleSelect`, `selectedIdsFor`), `useSurfaceMarquee`, `editorCommandBus.ts`, the selection wiring in `BlockEditorSurface.tsx`.
- **Look:** the canvas cell inspector (`canvas/view/CanvasInspector.tsx`: `.osionos-layout-cell-inspector`, `.osionos-layout-inspector-header`, panel width `LAYOUT_PANEL_WIDTHS.inspector` 304) and its controls `CanvasNumberControl`, `CanvasToggle`, `CanvasSegmented` (`canvas/view/CanvasInspectorControls.tsx`). Reuse them; do not restyle them.
- **Schemas:** `STYLE_SCALES`, `PROP_SCALE`, `sanitizeBlockStyle`, `COMPONENT_DEFINED_PROPS` (`entities/block/model/blockStyle.ts`); `src/app/styles/block-style.scss`; the registry `BlockDefinition` and `FrameConfig` (SB-1b); `VisibilityFormulaField` (SB-1c); `listRecordSources` and `FieldSpec` (SB-2a).
- **Moves:** `moveBlockInTree` (`block-editor/model/blockContextMenu.helpers.ts:173`), the `moveBlockUp` / `moveBlockDown` commands (`automations/model/commands/editingCommands.ts:45-46`, defaults `mod+shift+arrowup/down`, `defaultAutomations.ts:25-26`), the surface's block drag (`draggedBlockId` in `BlockEditorSurface.tsx`).
- **Perf harness:** `tests/e2e/perf/interactions.spec.mjs` (`measureFloor`, `runInteraction`, budgets; design §11's rule: p95 minus the floor median), `__perfSeed` (`src/shared/lib/perf/`).

**OWNS:**
- `src/features/block-editor/ui/inspector/` (new): `BlockInspector.tsx`, `InspectorGroup.tsx`, `SelectionOverlay.tsx`, `SelectionBreadcrumb.tsx`, `WidthHandle.tsx`, each ≤ 300 lines;
- `src/features/block-editor/model/inspectorModel.ts` (new): `inspectorModel`, `setBlockPath` (Interfaces);
- `src/features/block-editor/model/blockMoves.ts` (new): `moveBlockToParent`, `moveBlockOut`, `moveBlockIn`; and `moveBlockInTree` (modified) to copy only the path it changes (Rule 6);
- `blockStyle.ts` and `block-style.scss` (modified): `PROP_GROUP`, the `widthStep` scale (Rule 5);
- the registry `BlockDefinition` (modified): optional `inspector` and `style`; entries for `frame`, `paragraph`, the headings, `button` and `field` (whichever exist in your base);
- `editingCommands.ts`, `types.ts`, `defaultAutomations.ts` (modified): `moveBlockOut`, `moveBlockIn`, `focusInspector`;
- `BlockEditorSurface.tsx` (modified): mounts the inspector, overlay and breadcrumb in Edit only;
- tests: `tests/canvas/block-inspector.test.ts`, `tests/canvas/block-moves.test.ts`, `tests/e2e/functional/blockInspector.spec.mjs`, `tests/e2e/perf/inspector.spec.mjs` (new; under `tests/e2e/perf`, so it runs only with `PLAYWRIGHT_PERF=1`).

**MUST NOT TOUCH:** the canvas cell inspector and its controls (import them), `blockSelectionStore.ts` (subscribe to it), the vendored tree.

**Commit message:** `feat(editor): select, inspect and move blocks with a generated inspector`

## Interfaces

```ts
// registry additions (SB-1b's BlockDefinition)
interface InspectorField {
  key: string;                                     // a dotted path into block data: "frame.direction", "recordRef", "content"
  label: string;
  group: "Layout" | "Text" | "Binding";
  control: "segmented" | "dropdown" | "switch" | "text" | "number" | "source" | "field";
  options?: readonly { value: string; label: string }[];
  min?: number; max?: number;
}
interface BlockDefinition { …; inspector?: readonly InspectorField[]; style?: readonly (keyof BlockStyle)[] }

// blockStyle.ts
const PROP_GROUP: Readonly<Record<keyof BlockStyle, "Layout" | "Style" | "Text">>;

// inspectorModel.ts
interface InspectorControl { key: string; label: string; control: InspectorField["control"]; options?: InspectorField["options"]; value: unknown }
interface InspectorGroupModel { name: "Layout" | "Style" | "Text" | "Binding" | "Visibility"; controls: InspectorControl[] }
function inspectorModel(block: Block, definition: BlockDefinition): InspectorGroupModel[];   // pure
function setBlockPath(block: Block, key: string, value: unknown): Partial<Block>;             // pure; `undefined` removes the key

// blockMoves.ts (pure, path-copying)
function moveBlockToParent(blocks: Block[], blockId: string, parentId: string | null, index: number): Block[];
function moveBlockOut(blocks: Block[], blockId: string): Block[];   // becomes the next sibling of its parent
function moveBlockIn(blocks: Block[], blockId: string): Block[];    // becomes the last child of the previous sibling, if that sibling is a container
```

## Rules (each one is tested)

1. **One target.** The inspector shows when exactly one block is selected in the active surface (`selectedIdsFor(sourceKey)`). A block becomes selected by its drag handle (today), by Escape inside its text (if Escape already selects the block, use that path; otherwise add it), and by a click on a non-text block (a frame's background, a button, a field). Two or more selected blocks show "<n> blocks selected" and no controls. Edit only: in View, a preview (SB-6a) or a locked page, none of these render.
2. **Overlay, not re-render.** `SelectionOverlay` draws one outline (`--osio-accent`, 2 px, `pointer-events: none`) over the target, placed from its rect and updated on scroll and resize through one `ResizeObserver` and one `requestAnimationFrame` per change. Selecting a block re-renders no block. Test with the render counter: changing the selection between two blocks of a 200-block page changes no block's count.
3. **Breadcrumb.** Above the controls: the target's ancestors from the page root, each labelled by its registry `label` ("Page › Frame › Frame › Button"). Each crumb is a button that selects that ancestor. Test: selecting a button nested two frames deep shows four crumbs; clicking the first frame's crumb selects it.
4. **Generated groups.** `inspectorModel` returns, in this order and only when not empty: Layout (the definition's Layout fields, then its style props whose `PROP_GROUP` is Layout), Style, Text, Binding (fields with group Binding; `source` lists `listRecordSources()`, `field` lists the chosen source's fields), Visibility (`VisibilityFormulaField` editing `visibleWhen`). A definition's `style` list limits which style props appear; with no list, every prop except `COMPONENT_DEFINED_PROPS` and `tone`. A scale with ≤ 5 values is a `CanvasSegmented`; a longer one a dropdown; the space and width scales a `CanvasNumberControl` stepping through the scale. Every control has a Reset that removes the key. Tests: every key of `PROP_SCALE` has a `PROP_GROUP` (so a new scale cannot be forgotten); adding a value to a scale in the test changes the generated options with no inspector change; a definition with `inspector` fields yields those controls with the block's current values.
5. **Width.** `fixedWidth` and `basis` move to a new scale `widthStep` = `0–12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96, 120, 160` (in `--spacing` steps), a superset of today's values, so every stored value stays valid (test: each of today's 13 values sanitises to itself). The SCSS loop covers the new values. When the target's parent frame is a row, `WidthHandle` sits on its inline-end edge: dragging sets `width: "fixed"` and `fixedWidth` to the nearest `widthStep`; Shift+Alt+ArrowLeft/Right step it; double-click resets to `hug`.
6. **Moves.** Drag drops before, after, or into a frame (an empty frame shows one drop zone), through `moveBlockToParent`. Keyboard on the target: the existing `moveBlockUp`/`moveBlockDown` move it inside its parent; new `moveBlockOut` (`mod+shift+arrowleft`) and `moveBlockIn` (`mod+shift+arrowright`). Check the new defaults against every existing default for a clash and report the check. All four helpers copy only the path from the root to the changed parents, so every other block keeps its object; `moveBlockInTree` changes to the same rule (today it clones the whole tree, `blockContextMenu.helpers.ts:178`, so a move re-renders every block). Tests: after a move on a 2,000-block tree, every block outside the changed parents is `===` the old one; moving into a non-container does nothing; the selection follows the moved block.
7. **Writes.** A control writes through the editor's `updateBlock(pageId, id, setBlockPath(…))`, the path the block menu uses, so undo, sync and the page-file overlay need nothing new. Values pass `sanitizeBlockStyle` (style) or the definition's options (props); an invalid value is never written.
8. **Keyboard.** The inspector is `<aside aria-label="Block inspector">`. `focusInspector` (default `mod+alt+i`, checked for clashes) moves focus from the target to the first control and back. Every control is a labelled native control reachable by Tab; Escape inside the inspector returns focus to the target.
9. **Budgets** (`inspector.spec.mjs`, `PLAYWRIGHT_PERF=1`, a 2,000-block page from `__perfSeed`, the target a paragraph near the middle): changing a style value from the inspector, app cost p95 ≤ 16 ms (p95 minus the floor median, 20 runs); selecting another block, app cost p95 ≤ 16 ms; one keyboard move, app cost p95 ≤ 16 ms. Paste the three numbers with the floor.

## Steps

- [ ] **Step 1: Failing tests.** Canvas: `inspectorModel` (Rule 4's three cases), `setBlockPath` (set, nested, remove), `widthStep` superset, `PROP_GROUP` coverage, the four move helpers and their identity rule (Rule 6). e2e (`blockInspector.spec.mjs`): Rules 1–3, 5, 6 (drag and keyboard), 8, and one style change surviving a reload.
- [ ] **Step 2: Run them and see them fail.** `npm run test:canvas -- tests/canvas/block-inspector.test.ts tests/canvas/block-moves.test.ts`; `PW_BROWSER_SOURCE=system bash scripts/docker-run.sh test-e2e tests/e2e/functional/blockInspector.spec.mjs`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) a `PROP_SCALE` key without a `PROP_GROUP`;
  - (b) `moveBlockToParent` deep-clones the tree;
  - (c) the overlay sets a class on the selected block instead of drawing over it;
  - (d) a control writes a value outside its scale.
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; the new e2e green; `PLAYWRIGHT_PERF=1` `inspector.spec.mjs` with the three numbers; `interactions.spec.mjs` cases `enter`, `slash`, `longPage` before and after your change, back to back on the same host (paste both). Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the shortcut clash check, the perf numbers (yours and the before/after pairs), the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.

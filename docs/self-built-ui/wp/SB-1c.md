# SB-1c — `visibleWhen` on any block (self-built UI, phase S1)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §5 "Visibility" and §11 item 4). Settings sections show and hide parts by state: the 2FA recovery codes only once 2FA is on, the billing card only on a paid plan. Canvas cells already do this with a formula (`visibilityFormula`, evaluated by the Rust/WASM engine). This package gives every block the same rule, `visibleWhen`, and evaluates it only when a value it reads changes.

Base: the integration tip, **without SB-1b** (re-planned 2026-10-25 20:55 to run in parallel). Put the gate at the very top of `ReadOnlyBlockImpl` and of the `BlockEditor` render, before the first early return. SB-1b's registry lookup will land after yours, and the reviewer resolves the merge. Leave `frame` out of your tests.

**OWNS:**
- move `src/features/block-editor/ui/canvas/model/visibility.ts` → `src/entities/block/model/visibility.ts` (`git mv`). Update its four importers (`LayoutBlockReadOnly.tsx`, `CanvasCellView.tsx`, `CanvasRoot.tsx`, `tests/canvas/cell-visibility-formula.test.ts`). Leave no re-export at the old path. `LayoutBlockReadOnly` (an entity) importing a feature is a layering bug this move fixes;
- `src/entities/block/model/visibilityScope.ts` (new): the scope interface, the page-properties scope, the React context;
- `src/entities/block/ui/useVisibleWhen.ts` (new), `src/entities/block/ui/VisibleWhenGate.tsx` (new);
- `src/entities/block/model/types.ts` (`visibleWhen?: string` on `Block`);
- `src/entities/block/ui/ReadOnlyBlock.tsx` and `src/features/block-editor/ui/BlockEditor.tsx`: the gate wrapper only;
- the surfaces that mount a page's blocks get the provider: `BlockEditorSurface.tsx` and the read-only page renderer (find it: `rg -n "PageBlocksRenderer" src`);
- `src/features/block-editor/ui/visibility/VisibilityFormulaField.tsx` (new): extracted from `CanvasInspector.tsx:96-215` (input + Check + status line); `CanvasInspector.tsx` then uses it;
- `src/features/block-editor/ui/visibility/BlockVisibilityPopover.tsx` (new) and one "Show when…" item in `src/features/block-editor/model/useBlockContextMenu.tsx`;
- `src/features/page-file/model/blockOverlay.ts` (`visibleWhen: isBoundedText` in `EXTRA_BLOCK_KEYS`) and the header table in `pageFileCodec.ts` (the OVERLAY row);
- tests: `tests/canvas/visible-when.test.ts` (new), `tests/e2e/functional/visibleWhen.spec.mjs` (new).

**MUST NOT TOUCH:** the engine (`src/shared/notion-database-sys/**`, vendored), any block's own rendering, `usePlaygroundBlockEditor.ts`.

**Commit message:** `feat(blocks): visibleWhen shows or hides any block by formula`

## Interfaces

- Consumes (engine bridge, `@/shared/notion-database-sys/src/lib/engine/bridge`): `initFormulaEngine()` (idempotent; caches its promise), `compileFormula(text)` (caches handles by text), `getDependencies(handle)`, `evaluateHandle(handle, props)`, `FORMULA_ENGINE_UNAVAILABLE`, `validateFormula`.
- Produces:
  - `interface VisibilityScope { read(keys: readonly string[]): PropertyMap; subscribe(onChange: () => void): () => void }`. `read` returns the **same object** while none of the requested keys' values changed (`Object.is` per key). That makes it a valid `useSyncExternalStore` snapshot. The page-properties scope is the only implementation here; SB-2a adds record sources behind the same interface.
  - `createPagePropertiesScope(pageId: string): VisibilityScope` reads `usePageStore.getState().pageById(pageId)?.properties` through `toPropertyMap` and subscribes to `usePageStore`.
  - `VisibilityScopeProvider` / `useVisibilityScope(): VisibilityScope | null`.
  - `useVisibleWhen(formula: string | undefined): boolean`.
  - `<VisibleWhenGate block mode="edit" | "view">{children}</VisibleWhenGate>`.

## Rules

1. **Fail open, exactly like cells** (`evaluateCellVisibility`): no formula, no provider, engine not loaded, engine failed, or a formula that does not compile → **visible**. Only a falsy result hides.
2. **Compiled once, evaluated on change.** `useVisibleWhen` compiles through `compileFormula` (the engine caches by text), reads `getDependencies(handle)` once per handle, and subscribes with `useSyncExternalStore(scope.subscribe, () => scope.read(deps))`. It re-evaluates through `evaluateHandle` only when that snapshot changes, memoised on the snapshot object. When the engine is not ready, the hook calls `initFormulaEngine()` and re-renders once it resolves.
3. **Only blocks with a rule pay.** `ReadOnlyBlock` and `BlockEditor` wrap in `VisibleWhenGate` only when `block.visibleWhen` is a non-blank string. No hook runs for other blocks, and `areReadOnlyBlockPropsEqual` is unchanged.
4. **View hides, Edit reveals.** In View (`ReadOnlyBlock`, or a locked page), a hidden block renders nothing. In Edit, the author must still reach it, so it renders with `data-hidden-by-rule` (opacity from an existing token or `0.5`, dashed `--osio-border-default` outline) and a small "Hidden by rule" label. This mirrors `filterHiddenCells`.
5. **It only hides.** Permissions stay on the server. The file header says so, as `visibility.ts` already does.
6. **Authoring.** The block menu's "Show when…" opens `BlockVisibilityPopover` with `VisibilityFormulaField`: placeholder `prop("status") == "active"`, a Check button, a status line from `validateFormula`, and save on blur or Enter. Clearing the field removes `visibleWhen`. The commit goes through the same update path the menu's other items use.
7. **Persistence.** `visibleWhen` rides the `.omd` overlay (`EXTRA_BLOCK_KEYS`) and, once SB-1f lands, survives a raw-mode save. The page-file self-check (`tests/canvas/page-file-codec.test.ts:190-199`) must pass.

## Steps

- [ ] **Step 1: Failing unit tests** (`tests/canvas/visible-when.test.ts`), with a fake evaluator and a fake scope:
  - `evaluateCellVisibility` is importable from `src/entities/block/model/visibility.ts`, and `tests/canvas/cell-visibility-formula.test.ts` still passes after the move;
  - `createPagePropertiesScope`-style `read(["a"])` returns the same object twice when an unrelated key `b` changes, and a new object when `a` changes;
  - a visibility evaluation counter: one evaluation for the first read, zero after an unrelated key changes, one after `a` changes (the "evaluated on change" rule);
  - fail open: engine-unavailable result → visible; a compile error → visible; `false`, `0`, `""` and `null` → hidden.
- [ ] **Step 2: Failing e2e** (`tests/e2e/functional/visibleWhen.spec.mjs`, offline build; see `tests/e2e/functional/` for the page-property helpers):
  - a page with a text property `status`. A paragraph gets "Show when…" `prop("status") == "active"`;
  - in Edit, with status empty, the paragraph shows `data-hidden-by-rule` and the label;
  - after locking the page (View), the paragraph is absent; after setting status to `active`, it is present;
  - an invalid formula `prop(` shows the Check error, and the paragraph stays visible.
- [ ] **Step 3: Run both and see them fail.** `npm run test:canvas -- tests/canvas/visible-when.test.ts`; `PW_BROWSER_SOURCE=system bash scripts/docker-run.sh test-e2e tests/e2e/functional/visibleWhen.spec.mjs`.
- [ ] **Step 4: Implement** in this order: the move, then scope, hook, gate, provider wiring, field extraction, popover and menu item, then the overlay key.
- [ ] **Step 5: Gates.** Both new tests pass; `npm run test:canvas` rc 0; `npm run test:quality` rc 0. Run `tests/e2e/perf/interactions.spec.mjs` cases `enter`, `slash` and `longPage` and paste their p95 lines against `BUDGET`. Run the canvas e2e that covers cell visibility (`rg -l "visibilityFormula\|Visibility formula" tests/e2e`) and report it.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

List the files changed (the `git mv` shows as a rename), paste each gate's result lines, and give the commit SHA. A gate you could not run is SKIPPED with the reason, never passed.

# SB-6a — Edit and View on every page; `live` vs `preview` rendering (self-built UI, phase S6)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §12). The owner's words: "we click on edit and the page is totally usable, until we click on edit again." Every page already has a view-only state, the page lock (`locked` in the page config, toggled by `toggleLock` at `src/entities/page/model/usePageActions.ts:210`, offered today only as "Lock page" deep in the page menu at `src/entities/page/ui/PageHeaderBar.tsx:275`). This package:
- makes that state the visible **Edit / View** switch;
- gives every block renderer a render mode, so a block shown as a preview (hover cards, marketplace, profile README, public page, all through `PageBlocksRenderer`) can never write.

Depends on SB-1b (merged): the registry's `View` takes a `mode`, which SB-1b passes as the constant `"live"`.

**A defect this fixes today:** `ButtonBlockReadOnly` (`src/entities/block/ui/ReadOnlyBlock.tsx:611-626`) runs a button's program on click wherever it renders, previews included. A visitor clicking a button inside a marketplace preview or someone's profile README starts that program with the visitor's own permissions. In `preview` mode a program button must do nothing.

**OWNS:**
- `src/entities/block/ui/renderMode.tsx` (new): `RenderMode`, `RenderModeProvider`, `useRenderMode`;
- `src/entities/block/model/buttonEffect.ts` (new): the pure click decision;
- `src/entities/block/ui/ReadOnlyBlock.tsx`: read the mode once at the top of `ReadOnlyBlockImpl`, pass it to the registry `View` (replacing the constant), and use `buttonEffect` in `ButtonBlockReadOnly`;
- `src/features/block-editor/ui/BlockEditorSurface.tsx`: wrap in `RenderModeProvider mode="live"`;
- `src/widgets/page-renderer/ui/PageBlocksRenderer.tsx`: wrap in `RenderModeProvider mode="preview"`;
- `src/entities/page/ui/PageEditToggle.tsx` (new) and one line in `PageHeaderBar.tsx` to mount it before `PageShareButton`;
- tests: `tests/canvas/button-effect.test.ts`, `tests/e2e/functional/editViewToggle.spec.mjs`.

**MUST NOT TOUCH:** `usePageActions.ts` (call `toggleLock`, don't change it), the "Lock page" menu item (it stays, reading the same state), `runProgram.ts`, the canvas `preview` flag.

**Commit message:** `feat(pages): Edit/View switch on every page, and previews never run a block's action`

## Interfaces

- `type RenderMode = "live" | "preview"`. The context's default is **`"preview"`**: a surface must opt into live, so a forgotten provider fails safe.
- `useRenderMode(): RenderMode`.
- `buttonEffect(block: Pick<Block, "buttonProgram" | "buttonHref">, mode: RenderMode): "run-program" | "open-page" | "anchor" | "none"`:
  - a program in `preview` → `"none"`;
  - a program in `live` → `"run-program"`;
  - `page://<id>` → `"open-page"` in both modes, because opening a page writes nothing;
  - `/path` → `"anchor"`;
  - otherwise `"none"`.
- `PageEditToggle({ pageId })`: one button labelled **Edit** with `aria-pressed={!locked}`. It is rendered only when the viewer can edit the page (`canEditPage(page, usePageAccessContext())`, as `PageHeaderBar.tsx:204-206` does). Clicking it calls `actions.toggleLock()` through `runPageAction` with the same error toast. Use `@/shared/ui`'s `Button` (size sm, ghost tone; pressed = the package's selected look). Existing tokens only, no raw colour, and keyboard and focus as the package gives.

## Rules

1. In `preview`, a program button stays visible and focusable but gets `aria-disabled="true"` and `title="Buttons run on the page itself"`, and a click does nothing: no program, no toast.
2. `live` is the mode of the page itself, in both Edit and View: a locked page is still live, and its buttons and (later) fields work. That is the owner's "totally usable".
3. A preview nested inside a live surface stays a preview: `PageBlocksRenderer` sets `preview` explicitly.
4. Hooks: `useRenderMode()` is called once at the top of `ReadOnlyBlockImpl`, before any early return. `areReadOnlyBlockPropsEqual` is unchanged (context changes re-render through React, as they should).
5. Performance: one `useContext` per read-only block. Run `tests/e2e/perf/interactions.spec.mjs` cases `enter`, `slash` and `longPage` and paste their p95 lines against `BUDGET`.

## Steps

- [ ] **Step 1: Failing unit test** `tests/canvas/button-effect.test.ts`: every row of the `buttonEffect` table above, plus `buttonEffect({}, "live") === "none"`.
- [ ] **Step 2: Failing e2e** `tests/e2e/functional/editViewToggle.spec.mjs` (offline build):
  - a fresh page shows the **Edit** button with `aria-pressed="true"`, and the body has `[contenteditable="true"]`;
  - click → `aria-pressed="false"`, the page root has `osionos-page--locked`, and the page body has no `[contenteditable="true"]`;
  - reload → still View; the page menu's "Lock page" item shows checked;
  - click → editable again;
  - keyboard: Tab to the button and Space toggles it.
- [ ] **Step 3: Run both and see them fail.**
- [ ] **Step 4: Implement** in this order: render mode, providers, `buttonEffect` and the button, then the toggle.
- [ ] **Step 5: Gates.** Both tests pass; `npm run test:canvas` rc 0; `npm run test:quality` rc 0; the perf lines; and the existing specs that touch the page menu or lock (`rg -l "Lock page\|osionos-page--locked" tests/e2e`) still pass. Report them.
- [ ] **Step 6: Mutant** (scratch copy): make `buttonEffect` return `"run-program"` for a program in preview, and paste the failing test name.
- [ ] **Step 7: Commit** with the message above. No trailer, no push.

## Report

List the files changed, paste the gate result lines, the perf lines and the mutant result, and give the commit SHA. A gate you could not run is SKIPPED with the reason.

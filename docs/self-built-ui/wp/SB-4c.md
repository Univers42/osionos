# SB-4c — `tabs` and `dialog` container blocks (self-built UI, phase S4)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §5 "Containers"). Settings sections switch between sub-views (tabs) and open secondary screens in a modal, such as managing emails or customising cookies. This package adds both as registered container blocks on top of SB-1b's registry. Each reuses the `@osionos/ui` primitive the panels already use. Nothing is drawn twice.

Base: the integration tip with SB-1b merged.

## What exists (read these first)

- **Registry.** `BlockDefinition` (`rg -n "interface BlockDefinition" src`). It has `View({block, mode})` and `Edit({block, pageId, onUpdate, renderChildren})`. `frame` (SB-1b) is the model for a container: a category row with `selfRendersChildren: true`, a `:::frame <json>` markdown container, `MARKDOWN_KEYS`, slash ids `block:<type>`, and the AI/MCP allowlists. Follow every step SB-1b took for `frame` (its spec's "Devil conditions" 1, 2, 5, 7 and 8) for `tabs` and for `dialog`.
- **Tabs primitive.** `MiniTabs` (`packages/osionos-ui/src/primitives/MiniTabs.tsx`): `role="tablist"`, arrows, Home and End move and select. It has no tab `id` or `aria-controls`.
- **Dialog primitive.** `Modal` (`packages/osionos-ui/src/primitives/Modal.tsx`): portal, focus trap, modal stack, body scroll lock, and focus returned to the opener (:80-98). The trigger is `Button` from `@osionos/ui`.

**OWNS:**
- `src/entities/block/ui/blocks/TabsBlock.tsx`, `DialogBlock.tsx` (new; next to `FrameBlock`, wherever SB-1b put it) and their registry entries;
- the `BlockDefinition.Edit` props: add `renderChild(index: number): React.ReactNode`, implemented in `BlockEditor.tsx` beside the existing `renderChildren`. Only `tabs` uses it;
- `types.ts` (`tabs?`, `dialog?` on `Block`, and the two `BlockType`s), `blockCategories.ts` rows, the `MARKDOWN_KEYS` + header-table rows in `pageFileCodec.ts`, the serializer branch in `pageMarkdownSerialize.ts`, and the slash entries;
- `packages/markdown-engine`: the `:::tabs <json>` and `:::dialog <json>` containers in `containerToBlocks` and `MarkEngineBlockType`. This is a submodule commit on a local branch `feat/sb-SB-4c`, never pushed; report both SHAs;
- `packages/osionos-ui/src/primitives/MiniTabs.tsx`, only if needed: optional `idPrefix` so each tab gets `id="<prefix>-tab-<value>"` and `aria-controls="<prefix>-panel-<value>"`. A submodule commit, as above. Existing callers stay byte-identical in their output;
- the three allowlists SB-1b extended for `frame`;
- tests: `tests/canvas/tabs-dialog-roundtrip.test.ts` (new), `tests/e2e/functional/tabsDialogBlocks.spec.mjs` (new).

**MUST NOT TOUCH:** `Modal.tsx`'s behaviour, `usePlaygroundBlockEditor.ts`, the settings panels.

**Commit message:** `feat(blocks): tabs and dialog containers on the shared tab and modal primitives`

## Block data

```ts
tabs?: { labels?: Record<string, string>; initial?: string };   // keys and initial: CHILD BLOCK IDS; label ≤ 80 chars
dialog?: { title: string; trigger: string; size?: "sm" | "md" | "lg" };  // title and trigger ≤ 80 chars
```

Labels are keyed by child id, so reordering tabs keeps each label. A child without a label shows "Tab N". `sanitize` drops unknown keys, over-long strings and an `initial` that names no child, as `frameAttrs` does for `frame`. Pasted markdown is untrusted.

## Rules (each one is tested)

1. **Tabs, View.** A `MiniTabs` header lists one tab per child. Only the selected child renders, inside `role="tabpanel"` with `aria-labelledby` its tab and `tabIndex={0}`. The selection is local state and is never written to the block. The first selection is `initial` if it names a child, else the first child. Arrows, Home and End work as `MiniTabs` already does.
2. **Tabs, Edit.** The same header, plus the active child rendered through `renderChild(index)`. Enter, Backspace, slash and drag work in it exactly as in a frame. A "+" button at the end of the header (an `IconButton` with `aria-label="Add tab"`) appends a `frame` child and selects it. Double-click on a tab label edits it in place (an `Input`, Enter or blur saves, Esc cancels) through `onUpdate({ tabs })`.
3. **Dialog, View.** Renders a `Button` with the `trigger` text. Clicking it opens `Modal` (title = `dialog.title`, size = `dialog.size ?? "md"`) holding the children through `ReadOnlyBlock`. Esc and the close control close it, and focus returns to the trigger (the primitive does this; the e2e proves it). Opening it writes nothing, so it works in `preview` mode too.
4. **Dialog, Edit.** The trigger preview, then the children inline in a dashed region (`--osio-border-default`) headed "Dialog content", with two labelled `Input`s for the title and the trigger text. Children are edited through `renderChildren()`. The modal never opens in Edit.
5. **Narrow.** At 375 px neither block scrolls horizontally. The tab header wraps or scrolls inside itself (`overflow-x: auto` on the tablist only).
6. **Round trip.** Raw mode and the `.omd` file keep both blocks: `:::tabs {"labels":{…}}` … children … `:::` and `:::dialog {"title":…,"trigger":…}` … `:::`. A container with invalid JSON keeps its children and drops the field.

## Steps

- [ ] **Step 1: Failing tests.**
  - Canvas: round trip of a tabs block (3 frame children, labels on 2, `initial` = the 2nd) and a dialog block (2 paragraphs); deep-equal type, field and child contents. The invalid-JSON case. A sanitizer case: `initial` naming a missing child is dropped, and an 81-char label is dropped.
  - e2e (offline build): insert `/tabs`; add a tab; rename it; type in tab 2, switch to tab 1 and back, and the text is still there; lock the page (View) and drive it by keyboard: Tab into the tablist, ArrowRight selects the next tab and moves focus, End selects the last; the panel's `aria-labelledby` names the selected tab. Insert `/dialog`; set title and trigger; lock; click the trigger; focus is inside the dialog; Tab cycles inside it; Esc closes it and focus is on the trigger. At 375 px, `document.documentElement.scrollWidth <= innerWidth` for both.
- [ ] **Step 2: Run them and see them fail.** `npm run test:canvas -- tests/canvas/tabs-dialog-roundtrip.test.ts`; `PW_BROWSER_SOURCE=system bash scripts/docker-run.sh test-e2e tests/e2e/functional/tabsDialogBlocks.spec.mjs`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) labels keyed by index instead of child id;
  - (b) the tabpanel loses `aria-labelledby`;
  - (c) the dialog trigger does not get focus back (pass a no-op `onClose` that skips the primitive's restore, or remove the trigger ref).
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; `tests/e2e/perf/interactions.spec.mjs` cases `enter`, `slash` and `longPage` with their p95 lines against `BUDGET`. Report each.
- [ ] **Step 6: Commit** with the message above (the submodule commits first). No trailer, no push.

## Report

A status block (status/gates/changed/deviations), both submodule SHAs if any, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.

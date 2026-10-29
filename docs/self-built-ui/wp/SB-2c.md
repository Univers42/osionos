# SB-2c — The `field` block: every display, bound through `recordRef`/`fieldBind` (self-built UI, phase S2)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §5 "Bind." and §9). A settings row is a frame holding a title, a description and a control. This package is the control: one registered block, `field`, that renders the right `@osionos/ui` control for a bound source field. It reads and writes through SB-2a's `useBoundField`, so a switch bound to `settings:preferences` / `enterAddsNewline` calls the same store action as the Preferences panel's toggle.

Base: the integration tip with SB-1b, SB-2a and SB-6a merged (registry, binding hook, render mode).

## What exists (read these first)

- `useBoundField(recordRef, field)` → `{ value, status, spec, set, error }` and `FieldSpec.display` (`src/entities/block/model/bindingSources.ts`); `listRecordSources()` (`src/features/bindings/model/sourceRegistry.ts`).
- `useRenderMode()` (`src/entities/block/ui/renderMode.tsx`): `"live"` writes, `"preview"` never writes.
- `@osionos/ui` controls the panels use today: `Input` (`atoms/Input.tsx`), `Toggle` (`aria-label` from `label`, `primitives/Toggle.tsx:58`), `Checkbox`, `Dropdown` (`label` prop), `MiniTabs` (segmented, as `AccessibilitySettings.tsx` uses it). There is no `Radio` and no `Textarea` yet.
- The registry pattern (`BlockDefinition`, slash ids `block:<type>`, category row, allowlists): follow what SB-1b did for `frame`.

**OWNS:**
- `src/entities/block/ui/blocks/FieldBlock.tsx` (new) + its registry entry, the `field` `BlockType`, the `field?` block data in `types.ts`, the category row, the page-file key (`MARKDOWN_KEYS` or `EXTRA_BLOCK_KEYS`, whichever SB-1b used for `frame`'s record), and the allowlists;
- `src/features/bindings/ui/FieldBindingPicker.tsx` (new): the Edit-mode picker;
- `packages/osionos-ui/src/primitives/{RadioGroup,Textarea}.tsx` (new) + their exports. This is a submodule commit on a local branch `feat/sb-SB-2c`, never pushed; report both SHAs. They use the existing `--osio-field-*` and `--osio-control-*` tokens. No new colour;
- slash entries `/input`, `/select`, `/toggle`, `/checkbox`;
- a render counter for the field block in the existing perf harness (`src/shared/lib/perf/`, on only when `osio:perf` is set). Add a named counter there if none fits;
- `src/entities/block/ui/ReadOnlyBlock.tsx` and `src/features/block-editor/ui/BlockEditor.tsx`: the dispatch order only (Rule 8);
- tests: `tests/canvas/field-block.test.ts` (new), `tests/e2e/functional/fieldBlock.spec.mjs` (new).

**MUST NOT TOUCH:** the settings panels and stores, `bindingSources.ts`, the existing controls' behaviour (new optional props are fine).

**Commit message:** `feat(blocks): field block renders and writes any bound setting with the shared controls`

## Block data

```ts
field?: {
  label?: "above" | "inline" | "hidden";   // default "hidden": the row's own text carries the visible title
  helper?: string;                          // ≤ 200 chars, shown under the control
  display?: FieldDisplay;                   // optional override, only within the spec's compatible set (Rule 2)
};
// plus the existing recordRef ("settings:<name>") and fieldBind ("<key>")
```

## Rules (each one is tested)

1. **One control per display.** `text`/`email`/`url`/`password`/`search`/`number` → `Input` with that `type`; `multiline` → `Textarea`; `switch` → `Toggle`; `checkbox` → `Checkbox`; `dropdown` → `Dropdown`; `segmented` → `MiniTabs`; `radio` → `RadioGroup`; `checkbox-list` → one `Checkbox` per option. `image` and `file` render a "Not available yet" note (SB-4j adds them).
2. **Overrides stay compatible.** `field.display` applies only within `{dropdown, segmented, radio}` for option fields and `{text, multiline}` for text. Anything else is ignored, so a page cannot turn a `password` into `text`.
3. **Accessible name = the spec's label.** Every control's accessible name is `FieldSpec.label`, character for character, whatever `field.label` says. "hidden" keeps it as `aria-label` and shows no visible label. The helper and the error are tied with `aria-describedby`; an error sets `aria-invalid` and renders with `role="alert"` under the control.
4. **When it writes.** Switch, checkbox, dropdown, segmented, radio and checkbox-list write on change. Text-like displays keep a local draft and write on blur or Enter (multiline: Ctrl/Cmd+Enter), never per keystroke. Esc restores the bound value. Validation runs before the write (SB-2a's `set`); an error keeps the draft.
5. **Modes and states.**
   - `"preview"` mode renders the control disabled, showing the value, and never calls `set`.
   - `status: "loading"` → disabled with `aria-busy="true"`.
   - `"unavailable"` → the field name as a muted placeholder, the same as `BoundFieldReadOnly`.
   - A read-only spec → disabled.
6. **Edit mode.** The block shows the live control (still writing when live, so authors test it) and a small "settings:preferences › Start week" caption. An unbound field shows a "Choose a field" button that opens `FieldBindingPicker`: a searchable list of `source.label › field.label` from `listRecordSources()`. The slash command that inserted the block filters it (`/toggle` → switch and checkbox fields; `/select` → option fields; `/input` → text-like; `/checkbox` → checkbox and checkbox-list). Choosing writes `recordRef` + `fieldBind` through `onUpdate`.
7. **Renders alone.** Changing one bound field re-renders only that field block. e2e: two field blocks bound to two preferences, perf harness on; toggling one raises its render counter by exactly one and leaves the other's unchanged.
8. **A registered block owns its binding.** Today `ReadOnlyBlock` sends every block with `recordRef && fieldBind` to `BoundFieldReadOnly` (`ReadOnlyBlock.tsx:194-195`), and `BlockEditor` has the same `isProfileBound` branch (:484). Both run before SB-1b's registry lookup, so a bound `field` block would render as plain text. Move the registry lookup above both bound branches: a registered type renders through its definition, binding or not. A bound paragraph or heading (not registered) still goes to `BoundFieldReadOnly`, so the profile README e2e (`profilePagePublic.spec.mjs`, `profileBinding`) stays green unchanged. The perf cases of Step 5 cover the reorder.

## Steps

- [ ] **Step 1: Failing tests.**
  - Canvas: the display → control mapping (a pure `controlFor(spec, override)` function), the override rule (password stays password), and the sanitizer (unknown keys dropped, helper over 200 chars dropped).
  - e2e (offline build, signed-in offline user): a page with a frame row holding the text "Start week" and a `/select` field bound to `settings:preferences` › `weekStart`; choosing Sunday calls the store (`useUserPreferencesStore.getState().data.weekStart === 'sunday'`, read through `page.evaluate` on the store global or the Preferences panel showing "Sunday"); the control's accessible name is "Start week". A text field with a validator shows its error with `role="alert"` and does not write. Locked page (View) still writes; the marketplace/preview renderer does not (disabled). Rule 7's render counts.
- [ ] **Step 2: Run them and see them fail.** `npm run test:canvas -- tests/canvas/field-block.test.ts`; `PW_BROWSER_SOURCE=system bash scripts/docker-run.sh test-e2e tests/e2e/functional/fieldBlock.spec.mjs`.
- [ ] **Step 3: Implement** (submodule controls first).
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) a text field writes on every keystroke;
  - (b) preview mode calls `set`;
  - (c) the override lets `password` become `text`;
  - (d) the bound branch runs before the registry again (a bound field renders as text).
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; the `settingsKit` e2e unchanged; perf `interactions.spec.mjs` `enter`, `slash`, `longPage` p95 lines against `BUDGET`. Report each.
- [ ] **Step 6: Commit** with the message above (the submodule commit first). No trailer, no push.

## Report

A status block (status/gates/changed/deviations), both SHAs, the mutant results and the render-count lines from Rule 7. A gate you could not run is SKIPPED with the reason.

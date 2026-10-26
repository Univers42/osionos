# SB-4f — Shipped presets that reproduce today's settings look (self-built UI, phase S4)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §3 "Presets" and §6). A setting row, a card or a danger zone is today a class string in `settingsKit.tsx`. After this package each one is a named preset: a `BlockStyle` value for one block type, shipped as a system document. A block points at a preset by id, so a later change to the preset reaches every block that uses it. This package also makes text blocks render `style`, because a setting row's title and description are paragraphs.

Base: the integration tip with SB-1d merged (system documents, `serializeSystemDoc`, the loader, the generated schema). SB-1a and SB-1b are merged before it.

## What exists (read these first)

- **Sources of the look** (the parity targets):
  - `src/features/settings/ui/settingsKit.tsx`: `Section` (:26-33), `SettingRow` (:35-49, and `rowBorder` :16), `FeatureCard` (:91-102);
  - `packages/osionos-ui/src/atoms/Card.tsx`: `BASE` (:40);
  - `src/features/settings/ui/danger/DangerZone.tsx`: the danger box (:24).
- **Style:** `STYLE_SCALES`, `PROP_SCALE`, `sanitizeBlockStyle`, `resolveBlockStyle` and its two-level cache (`src/entities/block/model/blockStyle.ts`); the static CSS `src/app/styles/block-style.scss`; its coverage test `tests/canvas/block-style.test.ts`.
- **Documents:** `parseSystemDoc`, `serializeSystemDoc`, `loadSystemDoc` and the `import.meta.glob` in `src/features/system-pages/model/`; `scripts/build-system-doc-schema.mjs` and `src/system-docs/schema.generated.json`; the fixpoint test.
- **Text blocks:** `paragraph` and `heading_1`–`heading_3` in both renderers (`ReadOnlyBlock.tsx`, `BlockEditor.tsx`). Today they ignore `block.style`.
- **Line heights:** `--osio-line-height-tight` 1.25, `-normal` 1.5 (`global.css:340-342`). Settings use `leading-[18px]` 13 times and `leading-[16px]` 7 times, and `min-w-[220px]` 4 times (the setting-row text column).

**OWNS:**
- `src/system-docs/presets/settings.json` (new): the shipped presets, written with `serializeSystemDoc`, never by hand;
- `src/entities/block/model/blockPresets.ts` (new): `getShippedPreset`, `listShippedPresets`, `applyPreset`, `detachPreset`;
- `blockStyle.ts`: the preset merge in `resolveBlockStyle`, and two new scales (Rule 4);
- `block-style.scss`: rules for the new scales;
- `src/app/styles/global.css`: three geometry tokens (Rule 4), next to the other line-height tokens;
- `types.ts`: `preset?: string` and `presetName?: string` on `Block`; their page-file keys;
- `systemDoc.ts`: the preset checks of Rule 3; `loadSystemDoc.ts`: the glob excludes `presets/` (Rule 2);
- `schema.generated.json`: regenerated;
- `ReadOnlyBlock.tsx` and `BlockEditor.tsx`: `resolveBlockStyle` on the outer element of `paragraph` and `heading_1`–`heading_3` only (Rule 5);
- tests: `tests/canvas/block-presets.test.ts` (new), `tests/e2e/functional/presetParity.spec.mjs` (new), `tests/e2e/functional/fixtures/preset-parity.json` (new); extend `block-style.test.ts` and `system-doc.test.ts` (add cases, never delete one).

**MUST NOT TOUCH:** `settingsKit.tsx`, `Card.tsx`, `DangerZone.tsx` and every settings panel (they are the reference), the generated colour tokens, `FrameBlock.tsx`.

**Commit message:** `feat(blocks): shipped presets reproduce the settings rows, cards and danger zone`

## The presets

One document, `presets/settings.json` (`kind: "presets"`, `id: "settings"`). Each top-level block is one preset: its `id` is the preset id, its `type` is the block type the preset applies to, `presetName` is the label shown in the tray, `style` is the look, and the type's own props (for a frame, `frame`) are the defaults copied on apply. A preset has no children (structure is a component, SB-4e).

| id | type | presetName | source |
|---|---|---|---|
| `section` | frame | Section | `Section` wrapper, `space-y-4` |
| `section-title` | heading_2 | Section title | `Section` `h2` |
| `setting-row` | frame | Setting row | `SettingRow`, not stacked |
| `setting-row-stacked` | frame | Setting row (stacked) | `SettingRow` with `stack` |
| `setting-text` | frame | Setting text | the row's text column (`min-w-[220px] flex-1`) |
| `setting-title` | paragraph | Setting title | the row's title |
| `setting-title-danger` | paragraph | Setting title (danger) | the row's title with `danger` |
| `setting-description` | paragraph | Setting description | the row's description |
| `setting-actions` | frame | Setting actions | the row's action box |
| `card` | frame | Card | `Card` `BASE`, without the interactive classes |
| `feature-card` | frame | Feature card | `FeatureCard`'s inner row |
| `feature-card-icon` | frame | Feature card icon | `FeatureCard`'s icon tile |
| `danger-zone` | frame | Danger zone | `DangerZone`'s box |

Where the source uses `space-y-*` or `mt-*` between parts, the preset uses the parent frame's `gap` instead. The parity test compares the resulting positions (Rule 6), so margins and gaps must come out the same.

## Rules (each one is tested)

1. **Reference, not copy.** A block with `preset: "<id>"` renders the preset's `style` merged under its own: `{ ...preset.style, ...block.style }`, so the block's own key wins. An unknown id, or a preset whose `type` is not the block's type, is ignored: the block renders its own style only, with no error at render time.
2. **Shipped presets load eagerly.** `blockPresets.ts` reads `/src/system-docs/presets/*.json` with `import.meta.glob(…, { eager: true, import: "default" })` and parses each strictly once at module load. `loadSystemDoc`'s glob gets the negative pattern `"!/src/system-docs/presets/*.json"`, so no file is both eager and lazy. `npm run build` must print no `dynamic import will not move module into another chunk` line (paste the grep of the build log). `loadSystemDoc("presets", id)` returns the eager document.
3. **Strict checks** (`parseSystemDoc(…, "strict")`):
   - a `presets` document whose block has `children`, no `presetName`, or a `presetName` over 60 characters → error naming the block;
   - preset ids are unique across all preset documents (a test over the glob);
   - in any document, `preset` must match `^[a-z][a-z0-9-]{0,63}$` and name a shipped preset of the same type, else an error `"<blockId>.preset"`. Lenient mode keeps the block and lists `"<blockId>.preset"` in `unknown`.
4. **Two new scales, token-backed.** `leading`: `tight`, `normal`, `sm`, `xs`. `minWidth`: `0`, `label`. The new tokens are geometry, in `global.css` beside `--osio-line-height-normal`:
   - `--osio-line-height-sm: 18px` and `--osio-line-height-xs: 16px` (the two arbitrary line heights settings use today);
   - `--osio-min-width-label: 220px` (the setting-row text column).
   `[data-s-leading]` sets `line-height`; `[data-s-minWidth]` sets `min-width`. The SCSS coverage test covers them through `PROP_SCALE`. Add no other scale value unless the parity test proves it is needed. List each one you add in the report with its token.
5. **Text blocks render `style`.** `paragraph` and `heading_1`–`heading_3` put `resolveBlockStyle(block)` on their outer element in both renderers. A block with no `style` and no `preset` renders byte-identically to today: an e2e snapshot of the outer element's attributes and computed `font-size`, `line-height`, `color` and `padding` on an unstyled paragraph and heading_2, recorded on the base and compared after.
6. **Parity with the source.** `presetParity.spec.mjs` opens, for each preset, one real source element in an offline settings section, and a page holding the preset's block tree (for example a `setting-row` frame containing a `setting-text` frame with a `setting-title` and a `setting-description` paragraph, and a `setting-actions` frame). The fixture `preset-parity.json` lists, per preset, the source section and selector, and the matching block on the page.
   - Compare the computed values of: `display`, `flex-direction`, `flex-wrap`, `flex-grow`, `flex-shrink`, `align-items`, `justify-content`, `row-gap`, `column-gap`, the four `padding-*`, the four `border-*-width`, `-style` and `-color`, the four `border-*-radius`, `background-color`, `color`, `font-size`, `font-weight`, `line-height`, `min-width`.
   - Also compare the vertical distance between consecutive parts (title top to description top, row top to title top) within 1 px, with both containers forced to the same width (720 px).
   - Run light and dark. Every value must be equal. A fixture entry may skip a property only for the layout model (`display: block` on `Card` against a column frame), with a written reason. List every skip in the report.
7. **Apply and detach.** `applyPreset(block, id): Block` sets `preset` and copies the preset's props that the block does not have (for a frame, `frame`), never its `style`. `detachPreset(block): Block` writes `{ ...preset.style, ...block.style }` into `style` and removes `preset`. Both return a new object and leave the input unchanged. Unknown id → the input, unchanged.
8. **Still free on a cache hit.** `resolveBlockStyle` caches the merged result per (`block.style` identity, flat colours, preset id); a test proves two calls with the same inputs return the same object, and that a different preset id on the same `style` object returns a different one.

## Steps

- [ ] **Step 1: Record the base.** On the base, record Rule 5's unstyled paragraph and heading snapshot into `tests/e2e/functional/fixtures/text-block-baseline.json`.
- [ ] **Step 2: Failing tests.**
  - Canvas (`block-presets.test.ts`): the merge order; the unknown-id and wrong-type cases; `applyPreset` and `detachPreset`, including that the input is unchanged; the cache identity of Rule 8; the strict and lenient preset errors of Rule 3; preset ids unique; every preset document passes strict parse and the fixpoint.
  - `block-style.test.ts`: the `leading` and `minWidth` rules exist and name the new tokens.
  - e2e: Rule 5's unchanged text blocks and Rule 6's parity, light and dark.
- [ ] **Step 3: Run them and see them fail.** `npm run test:canvas -- tests/canvas/block-presets.test.ts tests/canvas/block-style.test.ts`; `PW_BROWSER_SOURCE=system bash scripts/docker-run.sh test-e2e tests/e2e/functional/presetParity.spec.mjs`.
- [ ] **Step 4: Implement.** Write the presets document through `serializeSystemDoc`, then `npm run system-docs:schema`.
- [ ] **Step 5: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) the merge order is reversed (the preset wins over the block);
  - (b) `setting-row` loses `borderSides: "top"`;
  - (c) `--osio-line-height-sm` is 20px;
  - (d) the cache ignores the preset id.
- [ ] **Step 6: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0 (the schema `--check` and the fixpoint pass); `npm run build` rc 0 plus Rule 2's grep; the `settingsKit`, `frameBlock` and `profileBinding` e2e unchanged. Report each.
- [ ] **Step 7: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the scale values added with their tokens, the parity skips with their reasons, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.

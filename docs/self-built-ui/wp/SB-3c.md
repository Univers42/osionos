# SB-3c — Display blocks `chip`, `avatar`, `meter`, `status`, `secret`, and heading anchors (self-built UI, phase S3)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §5 "Bind." and §9). Settings rows show small read-only facts: a plan badge, an avatar, seat usage, a connection status, a masked key. Their section headings are also deep-link targets (`?settings=<id>#<anchor>`). This package adds the five display blocks over the `@osionos/ui` primitives, plus an `anchor` on headings. Each block shows a static value or a bound one through SB-2a's binding.

Base: the integration tip with SB-1b, SB-2a, SB-2c and SB-3a merged. SB-2c moved the registry lookup above the bound-text branch, so a bound registered block renders itself.

## What exists (read these first)

- `useBoundField(recordRef, fieldBind)` (`src/entities/block/model/bindingSources.ts`) and `BoundFieldReadOnly`'s placeholder for an unavailable value.
- Primitives:
  - `Badge` (`packages/osionos-ui/src/atoms/Badge.tsx`, tones default, accent, success, danger, warning);
  - `Avatar` (`atoms/Avatar.tsx`: `name`, `src`, `size`);
  - `Button` / `IconButton` (copy, reveal).
  - There is no meter or status primitive.
- Anchors: `SettingsView.tsx:58` scrolls to `[data-settings-anchor="<id>"]`, and `Section` writes that attribute (`settingsKit.tsx:27`). The section registry (`src/features/settings/model/sections.ts`) lists each section's anchors. SB-5 packages add theirs.
- The registry pattern: follow SB-1b's `frame` for every new type (category row, page-file key, slash id `block:<type>`, allowlists).

**OWNS:**
- `src/entities/block/model/blockValue.ts` (new): `useBlockValue(block): { value: unknown; status: SourceStatus }`, the bound value when `recordRef` + `fieldBind` are set, else the block's own static value. All five blocks use it; nothing else reads bindings;
- `src/entities/block/registered/{chip,avatar,meter,status,secret}/*.tsx` (new) + registry entries, `BlockType`s, block data in `types.ts`, category rows, page-file keys, slash entries, allowlists;
- `src/features/settings/model/settingsAnchor.ts` (new): `scrollToSettingsAnchor(root, anchor)`, moved out of `SettingsView.tsx:58`, which then calls it;
- heading blocks (`heading_1`–`heading_3` in both renderers): render `anchor` as `data-settings-anchor` and `id`. The anchor is a slug, `^[a-z0-9][a-z0-9-]{0,63}$`; anything else is dropped;
- tests: `tests/canvas/display-blocks.test.ts` (new), `tests/e2e/functional/displayBlocks.spec.mjs` (new).

**MUST NOT TOUCH:** the primitives' behaviour (new optional props are fine; `@osionos/ui` is a submodule: commit there first on a local `feat/sb-SB-3c` branch and report both SHAs), the settings panels, `sections.ts`.

**Commit message:** `feat(blocks): chip, avatar, meter, status and secret blocks, and heading anchors`

## Block data

```ts
chip?:   { text?: string; tone?: "default" | "accent" | "success" | "danger" | "warning" };
avatar?: { name?: string; src?: string; size?: "xs" | "sm" | "md" | "lg"; srcField?: string };  // name from the binding, src from srcField of the same source
meter?:  { value?: number; max?: number; maxField?: string; label?: string; warnAt?: number; dangerAt?: number };  // fractions 0..1
status?: { map?: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" }> };
secret?: { value?: string; reveal?: boolean };   // reveal: show a Reveal toggle; copy is always there
```

Strings are at most 200 characters (`map` labels 80, at most 20 entries). `src` must be `https:` or a same-origin path; anything else is dropped, as `sanitizeLinkBlockFields` does for links. Sanitizers drop unknown keys.

## Rules (each one is tested)

1. **One value path.** Each block shows `useBlockValue(block).value`. Loading → a skeleton of the block's own size (no layout shift); unavailable → the field-name placeholder, as `BoundFieldReadOnly` does.
2. **chip.** A `Badge` with `chip.tone` (default "default") and the value as text.
3. **avatar.** `Avatar` with `name` = value and `src` = the same source's `srcField` value (or `avatar.src`). The accessible name is the person's name. A broken image falls back to initials (the primitive's behaviour, proved in e2e with a 404 src).
4. **meter.** `role="meter"`, `aria-valuemin="0"`, `aria-valuemax`, `aria-valuenow`, and `aria-label` = `meter.label`. The bar fill is `value / max`, clamped to 0..1. Tone accent below `warnAt`, warning at or above `warnAt`, danger at or above `dangerAt`. Defaults 0.8 and 1. The text "3 of 5" sits beside the bar, so colour is never the only signal. `max` = `maxField` of the same source, or `meter.max`.
5. **status.** A dot plus a label, looked up from `status.map[String(value)]`. An unmapped value shows the raw value with tone neutral. The label is text, so colour is never the only signal.
6. **secret.** A monospace masked field (`••••` plus the last 4 characters when longer than 8). Copy is an `IconButton` with `aria-label="Copy"` that copies the FULL value through `navigator.clipboard.writeText` and announces "Copied" (`aria-live="polite"`). With `reveal: true`, a Reveal toggle (`aria-pressed`) shows the full value until it is toggled off or the block unmounts. The full value is never put in a DOM attribute or a title.
7. **Anchors.** A heading with `anchor` renders `data-settings-anchor` and `id`. `scrollToSettingsAnchor(root, anchor)` finds `[data-settings-anchor]` inside `root` and scrolls it into view (`block: "start"`), honouring reduced motion. `SettingsView` keeps its behaviour through it (the `settingsKit` e2e passes unchanged).

## Steps

- [ ] **Step 1: Failing tests.**
  - Canvas: the sanitizers (a `javascript:` src dropped, an over-long label dropped, a bad anchor dropped); meter tone thresholds and clamping (value 6 of 5 → full and danger); the status lookup and fallback; the secret mask (`abcd1234efgh` → `••••efgh`, `abc` → `•••`).
  - e2e (offline): a page with each block, static and bound to a test source the e2e registers through the app's source registry. Assert: the meter's `aria-valuenow` and its "3 of 5" text; the status label; the avatar initials after a 404; Copy writes the full value (read `navigator.clipboard` in a context granted `clipboard-read`) while the DOM never contains it; Reveal shows it; at 375 px nothing scrolls horizontally. A heading with `anchor: "danger"` inside the styleguide system page (SB-1e) is scrolled into view by `scrollToSettingsAnchor`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) the secret's full value goes into a `title`;
  - (b) the meter does not clamp;
  - (c) `useBlockValue` ignores the binding.
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; the `settingsKit` e2e unchanged; screenshots of the five blocks, light and dark, at 375 and 1440, under `target/shots/`. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.

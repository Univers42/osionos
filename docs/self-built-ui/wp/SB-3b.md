# SB-3b — The `button` block on the shared `Button`: tones, sizes, icon, loading, action results (self-built UI, phase S3)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §5 "Actions"). Settings panels use the `@osionos/ui` `Button` in five tones and three sizes, with icons, icon-only buttons and busy states. The `button` block draws its own look instead (`ReadOnlyBlock.tsx:589-596`: two variants and hand-written classes). This package moves the block onto the shared `Button`, into the block registry, and gives it the states an action needs: busy, a sudo retry, and a secret shown once.

Base: the integration tip with SB-1b, SB-3a and SB-6a merged.

## What exists (read these first)

- **The block.**
  - View: `ButtonBlockReadOnly` (`src/entities/block/ui/ReadOnlyBlock.tsx:611`) and its `case "button"` (:440).
  - Edit: `ButtonBlockEditor` (`BlockEditor.tsx:1149`) and `ButtonSettingsPopover` (`src/features/button-program/ui/`).
  - Fields: `buttonLabel`, `buttonHref`, `buttonVariant`, `buttonProgram` (`types.ts:180-183`).
  - SB-6a's `buttonEffect(block, mode)` decides what a click does.
- **The primitive.** `Button` (`packages/osionos-ui/src/atoms/Button.tsx`, `tone`: default, primary, danger, danger-subtle, ghost; `size`: sm, md, lg), `IconButton`, `IconValueView` and `shared/iconValue` (the page-icon format), `IconPicker`, `Modal`.
- **Style.** SB-1a's `style.tone` (scale: default, primary, subtle, ghost, danger, danger-subtle, success, warning, accent) and `style.size`. `size` is in `COMPONENT_DEFINED_PROPS`, so its CSS belongs to the block that uses it, which is this one.
- **Actions.** SB-3a's `runAppAction`, `useActionState`, the `app_action` program step, and `ActionResult` (`sudo_required`, `busy`, `ok` with `secret`). Programs never store a secret (SB-3a condition 7).

**OWNS:**
- `src/entities/block/registered/button/ButtonBlock.tsx` (new; View + Edit) and its registry entry. Delete the `case "button"` from both switches, along with `ButtonBlockReadOnly`, `BUTTON_BASE_CLASS` and `buttonVariantClass` once nothing uses them;
- `src/entities/block/registered/button/SecretRevealDialog.tsx` (new);
- `src/features/button-program/ui/ButtonSettingsPopover.tsx`: the appearance controls;
- `src/services/button-program/runProgram.ts` and `interpreter.ts`: an `onSecret` callback (Rule 5) only;
- `types.ts`: `buttonIcon?: string` (an icon value string) and `buttonIconOnly?: boolean`, plus their page-file overlay keys;
- tests: `tests/canvas/button-block.test.ts` (new), `tests/e2e/functional/buttonBlockLook.spec.mjs` (new); extend the existing button e2e (add cases, never delete one).

**MUST NOT TOUCH:** `Button.tsx`, `buttonTones.ts` (no new tone), the action registry and runner semantics (SB-3a), `buttonEffect` (SB-6a).

**Commit message:** `feat(blocks): the button block uses the shared Button, with icon, busy state, sudo retry and one-time secrets`

## Rules (each one is tested)

1. **Tone and size come from `style`.**
   - `style.tone` maps onto `ButtonTone`: default, primary, danger, danger-subtle and ghost as they are; `subtle` → ghost; `accent` → primary; `success` and `warning` → default. The mapping is a pure exported function with a test of all 9 inputs.
   - `style.size` → `size`, default md.
   - The wrapper still gets `resolveBlockStyle(style)`, minus `data-s-tone` and `data-s-size`, so the generic tone fill never paints behind the button.
2. **Old pages look the same.**
   - With no `style.tone`: `buttonVariant: "secondary"` → default; `"primary"` or absent → primary.
   - Step 1 records, on the base, the computed `background-color`, `color` and `height` of a primary and a secondary button block, light and dark, into `tests/e2e/functional/fixtures/button-look.json`. After the change, the colours are equal and the height is within 4 px.
   - The first appearance edit in the popover writes `style.tone`/`style.size` and removes `buttonVariant`.
3. **Icon.**
   - `buttonIcon` renders through `IconValueView` before the label.
   - With `buttonIconOnly` and an icon, the visible label goes and `aria-label` = the label.
   - `buttonIconOnly` without an icon is ignored, so no button is ever unnamed.
   - The popover gets an icon picker (`IconPicker`), an "Icon only" `Toggle`, a tone `Dropdown` (the 9 style tones, labelled) and a size `MiniTabs`.
4. **Busy.** While its run is pending, the button is `disabled`, has `aria-busy="true"` and shows a spinner in place of the icon, keeping its width (no layout shift). A second click does nothing. When the run's last step is an `app_action`, this pending state is `useActionState(name, argsKey).pending`, so two buttons bound to the same action and args both show busy.
5. **Results.**
   - `sudo_required` → an inline line under the button ("Confirm it's you, then try again"), announced with `aria-live="polite"`; the next click runs again. There is no automatic re-send.
   - `failed` → the message in the same line with `role="alert"`.
   - `ok` with a `secret` → `SecretRevealDialog`: the secret in a read-only monospace field, a Copy button and "Done". The secret lives only in that dialog's state and is gone when it closes. It reaches the button through `runButtonBlock(block, hostPageId, { mode, onSecret })`. The interpreter calls `onSecret` and keeps stripping the secret from every log, as SB-3a requires.
   - Test: after "Done", the secret is in no DOM node, and `getLastRun()` serialised does not contain it.
6. **Preview.** As SB-6a decided, a program button in preview does nothing. It renders `disabled` with `title="Runs on the live page"`. Link buttons keep working.
7. **Registry.** `button` resolves through the registry in both View and Edit. The existing button e2e (`buttonProgram.spec.mjs`, `buttonProgramDestructive.spec.mjs`, `buttonProgramEditor.spec.mjs`, `bridge-stub/buttonProgramWrite.spec.mjs`) pass with no edit to their existing cases.

## Steps

- [ ] **Step 1: Record the look on the base** (fixture above), then write the failing tests: the tone mapping, the icon-only naming rule, busy (`aria-busy` and no second run), sudo retry line, secret dialog lifecycle, preview disabled.
- [ ] **Step 2: Run them and see them fail.** `npm run test:canvas -- tests/canvas/button-block.test.ts`; `PW_BROWSER_SOURCE=system bash scripts/docker-run.sh test-e2e tests/e2e/functional/buttonBlockLook.spec.mjs`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) the wrapper keeps `data-s-tone`;
  - (b) icon-only without an icon drops the label;
  - (c) the secret is kept in a module variable after "Done".
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; the four existing button specs and the new one; screenshots of a primary, a danger-subtle and an icon-only button, light and dark, at 375 and 1440, saved under `target/shots/` for the PR. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the look fixture values before and after, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.

# TASK SPEC: Selection Toolbar Chrome, Component 6 — Remediate AI Section ARIA Parent Structure

## 1. Goal
Fix WCAG 2.2 / ARIA rule `aria-required-parent` on selection toolbar AI buttons by wrapping `role="menuitem"` buttons within a valid `role="menu" aria-label="Skills"` container spanning both AI skills and Edit with AI action, preserving Playwright test compatibility.

---

## 2. Exact Filepaths
1. `src/components/blocks/selection-toolbar/AiMenu.tsx`
2. `src/components/blocks/selection-toolbar/InlineSelectionToolbar.tsx`
3. `tests/e2e/functional/menuChrome.spec.mjs`
4. `tests/e2e/visual/a11y.spec.mjs`

---

## 3. Technical Requirements

### `src/components/blocks/selection-toolbar/InlineSelectionToolbar.tsx`
- Wrap `AiSkillsSection` and `AiEditRow` in `<div role="menu" aria-label="Skills" className="pt-1">`.

### `src/components/blocks/selection-toolbar/AiMenu.tsx`
- Strip redundant inner `div role="menu"` from `AiSkillsSection`.
- Keep `role="menuitem"` on `AiEditRow` (`ToolbarRowButton`) so all 5 AI actions are valid children of `role="menu"`.

### `tests/e2e/functional/menuChrome.spec.mjs`
- Target `page.getByRole("menu", { name: "Turn into" })` to avoid strict-mode collision when selection toolbar is open.

### `tests/e2e/visual/a11y.spec.mjs`
- Audit `[data-testid="inline-selection-toolbar"]` with 0 axe violations.

---

## 4. Verification Protocol (Docker-First)
1. `npm run test:quality` -> 0 errors.
2. `npm run test:e2e -- tests/e2e/functional/menuChrome.spec.mjs tests/e2e/functional/inlineToolbar.spec.mjs tests/e2e/visual/a11y.spec.mjs` -> 65/65 passed.

---

## 5. Commit Plan
- Message: `fix(a11y): wrap ai section menuitems in composite role menu container`
- Author: `DJSurgeon <djsurgeon83@gmail.com>`
- Flag: `-s`

---

## 6. Done-When
- [x] `InlineSelectionToolbar.tsx` and `AiMenu.tsx` wrap all 5 AI actions in `role="menu"`.
- [x] `tests/e2e/functional/menuChrome.spec.mjs` scopes Turn into menu lookup.
- [x] `npm run test:quality` passes (0 errors).
- [x] All 65 Playwright E2E and visual tests pass.
- [x] Commit signed with `-s` by `DJSurgeon`.
- [x] Documented in `docs/CHANGELOG.md`.

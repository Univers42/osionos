# TASK SPEC: Selection Toolbar Chrome, Component 6 — Remediate AI Section ARIA Parent Structure

## 1. Goal
Fix WCAG 2.2 / ARIA rule `aria-required-parent` on selection toolbar AI buttons by wrapping `role="menuitem"` buttons within a valid `role="group" aria-label="Skills"` container and removing orphaned `role="menuitem"` from the standalone `Ask AI` toolbar row button.

---

## 2. Exact Filepaths
1. `src/components/blocks/selection-toolbar/AiMenu.tsx`
2. `tests/e2e/visual/a11y.spec.mjs`

---

## 3. Technical Requirements

### `src/components/blocks/selection-toolbar/AiMenu.tsx`
1. In `AiSkillsSection` (line 52):
   - Add `role="group"` and `aria-label="Skills"` to the wrapper `<div>`:
     ```tsx
     <div role="group" aria-label="Skills" className="pt-1">
     ```
2. In `AiEditRow` (line 80-85):
   - Remove `role="menuitem"` so `ToolbarRowButton` renders as a standard toolbar action button (matching `Comment`).

### `tests/e2e/visual/a11y.spec.mjs`
- Expand `a11y: inline text selection toolbar surface` to audit the entire toolbar `[data-testid="inline-selection-toolbar"]` with 0 axe violations.

---

## 4. Verification Protocol (Docker-First)
1. `npm run test:quality` -> 0 errors.
2. `npm run test:e2e -- tests/e2e/functional/selectionPanel.spec.mjs` -> 3/3 passed.
3. `npm run test:e2e -- tests/e2e/visual/a11y.spec.mjs` -> 5/5 passed (0 violations).

---

## 5. Commit Plan
- Message: `fix(a11y): wrap ai skills menuitems in role group and standardize edit action`
- Author: `DJSurgeon <djsurgeon83@gmail.com>`
- Flag: `-s`

---

## 6. Done-When
- [x] `AiMenu.tsx` wraps skills in `role="menu"` and standardizes `AiEditRow`.
- [x] `tests/e2e/visual/a11y.spec.mjs` audits full inline selection toolbar with 0 violations.
- [x] `npm run test:quality` passes (0 errors).
- [x] `tests/e2e/functional/selectionPanel.spec.mjs` passes (3/3).
- [x] Commit signed with `-s` by `DJSurgeon`.
- [ ] Documented in `docs/CHANGELOG.md`.

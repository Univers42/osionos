# TASK SPEC: Selection Toolbar Chrome, Component 5 — Remediate TurnIntoMenu Accessible Name

## 1. Goal
Fix WCAG 2.2 SC 2.5.3 (Label in Name / `label-content-name-mismatch`) on `TurnIntoMenu.tsx` trigger button by ensuring its accessible name includes the visible block type label (`turnIntoRowLabel(blockType)`), while preserving `title="Turn into"` for test compatibility and tooltips.

---

## 2. Exact Filepaths
1. `src/components/blocks/selection-toolbar/TurnIntoMenu.tsx`

---

## 3. Technical Requirements

### `src/components/blocks/selection-toolbar/TurnIntoMenu.tsx`
- On the trigger button (line 126-138):
  Update:
  ```tsx
  aria-label={`Turn into: ${turnIntoRowLabel(blockType)}`}
  ```
  Ensures accessible name contains the visible label (e.g., "Normal Text", "Heading 1") satisfying WCAG 2.2 SC 2.5.3.

---

## 4. Verification Protocol (Docker-First)
1. `npm run test:quality` -> 0 errors.
2. `npm run test:e2e -- tests/e2e/functional/selectionPanel.spec.mjs` -> 3/3 passed.
3. `npm run test:e2e -- tests/e2e/functional/inlineToolbar.spec.mjs` -> passed.

---

## 5. Commit Plan
- Message: `fix(a11y): align turn into menu button accessible name with visible label`
- Author: `DJSurgeon <djsurgeon83@gmail.com>`
- Flag: `-s`

---

## 6. Done-When
- [x] `TurnIntoMenu.tsx` updated with accessible name containing visible label text.
- [x] `npm run test:quality` passes (0 errors).
- [x] `tests/e2e/functional/selectionPanel.spec.mjs` passes (3/3).
- [x] Commit signed with `-s` by `DJSurgeon`.
- [x] Documented in `docs/CHANGELOG.md`.

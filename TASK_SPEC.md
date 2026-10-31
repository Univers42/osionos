# TASK SPEC: Batch 1, Component 2 — Remediate Table Row Drag Handle

## 1. Goal
Upgrade `RowDragHandle` in `TableParts.tsx` to meet WCAG 2.2 SC 2.5.8 (Target Size >= 24x24 px) and SC 2.4.11 / 2.4.12 (Focus Visible), positioning it to avoid cell text occlusion.

---

## 2. Exact Filepaths
1. `src/features/block-editor/ui/table/TableParts.tsx`

---

## 3. Technical Requirements

### `src/features/block-editor/ui/table/TableParts.tsx`
- In `RowDragHandle` (around line 80):
  Replace:
  ```tsx
  className="absolute left-0 top-1/2 z-[var(--osio-z-raised)] flex h-5 w-4 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-md bg-[var(--osio-bg-surface)]/90 text-[var(--osio-fg-muted)] opacity-0 shadow-[var(--osio-shadow-sm)] transition-opacity hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:opacity-100 group-hover/table:opacity-50 group-hover/row:opacity-100 active:cursor-grabbing"
  ```
  With:
  ```tsx
  className="absolute left-0 top-1/2 z-[var(--osio-z-raised)] flex h-6 w-6 min-h-[24px] min-w-[24px] -translate-y-1/2 -translate-x-1 cursor-grab touch-none items-center justify-center rounded-md bg-[var(--osio-bg-surface)]/90 text-[var(--osio-fg-muted)] opacity-0 shadow-[var(--osio-shadow-sm)] transition-opacity hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] group-hover/table:opacity-50 group-hover/row:opacity-100 active:cursor-grabbing"
  ```

---

## 4. Verification Protocol (Docker-First)
- `npm run test:quality`
- `npm run test:e2e -- tests/e2e/visual/a11y.spec.mjs`

---

## 5. Commit Plan
- Message: `fix(a11y): upgrade table row drag handle to 24px target size with focus ring`
- Author: `DJSurgeon <djsurgeon83@gmail.com>`
- Flag: `-s`

---

## 6. Done-When
- [x] `TableParts.tsx` `RowDragHandle` upgraded to `h-6 w-6 min-h-[24px] min-w-[24px]` with focus ring.
- [x] `npm run test:quality` passes (0 errors).
- [x] `npm run test:e2e -- tests/e2e/visual/a11y.spec.mjs` passes (0 violations).
- [x] Commit signed with `-s` by `DJSurgeon`.
- [x] Documented in `docs/CHANGELOG.md`.

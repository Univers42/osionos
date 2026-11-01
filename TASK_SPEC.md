# TASK SPEC: Batch 2 (Database Views & Row Controls), Component 1 — Remediate Universal Block Drag Handle

## 1. Goal
Upgrade the universal block drag handle (`[data-testid="block-drag-handle"]`) rendered on all editor blocks in `src/features/block-editor/ui/BlockEditorSurface.tsx` to satisfy:
1. **WCAG 2.2 SC 2.5.8 (Target Size - Minimum)**: Increase hit target from 18x18px (`p-0.5` around 16x16 svg) to minimum **24x24px** (`flex h-6 w-6 min-h-[24px] min-w-[24px]`).
2. **WCAG 2.2 SC 2.4.11 & 2.4.12 (Focus Not Obscured / Focus Appearance)**: Ensure keyboard focus makes the handle fully visible (`focus-visible:opacity-100`) and displays a standard token outline ring (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]`).

---

## 2. Exact Filepaths
1. `src/features/block-editor/ui/BlockEditorSurface.tsx`

---

## 3. Technical Requirements

### `src/features/block-editor/ui/BlockEditorSurface.tsx`
- In `DraggableBlockWrapper` (around line 1633-1641):
  Update the button classes:
  ```tsx
  className={`absolute -left-7 ${handleTop} flex h-6 w-6 min-h-[24px] min-w-[24px] items-center justify-center cursor-grab touch-none rounded-md text-[var(--osio-fg-subtle)] opacity-0 transition-colors transition-opacity hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-muted)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] osio-drag-handle active:cursor-grabbing`}
  ```

---

## 4. Verification Protocol (Docker-First)
1. `npm run test:quality` -> 0 errors.
2. `npm run test:e2e -- tests/e2e/bridge-stub/blockDragWheel.spec.mjs tests/browser/specs/hoverBehavior.mjs` -> pass.
3. `npm run test:e2e -- tests/e2e/visual/a11y.spec.mjs` -> 5/5 pass (0 violations).

---

## 5. Commit Plan
1. Commit 1: `fix(a11y): upgrade block drag handle to 24px target size with focus ring`
   - Files: `src/features/block-editor/ui/BlockEditorSurface.tsx`, `TASK_SPEC.md`
   - Author: `DJSurgeon <djsurgeon83@gmail.com>`
   - Flag: `-s`
2. Commit 2: `docs(changelog): document universal block drag handle touch target and focus ring upgrade`
   - Files: `docs/CHANGELOG.md`
   - Author: `DJSurgeon <djsurgeon83@gmail.com>`
   - Flag: `-s`

---

## 6. Done-When
- [x] `BlockEditorSurface.tsx` updated with 24x24px dimensions and `:focus-visible` ring.
- [x] `npm run test:quality` passes (0 errors).
- [x] Drag handle and hover E2E tests pass.
- [x] A11y visual tests pass with 0 violations.
- [x] Both micro-commits created with `-s` signed by `DJSurgeon`.

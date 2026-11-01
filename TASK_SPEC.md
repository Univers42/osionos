# TASK SPEC: Batch 2 (Database Views & Row Controls), Component 2 — Remediate TableAddButton

## 1. Goal
Upgrade the table edge add button and quick-count flyout in `src/features/block-editor/ui/table/TableAddButton.tsx` to satisfy:
1. **WCAG 2.2 SC 2.5.8 (Target Size - Minimum)**: Ensure primary "+" button and quick-count flyout buttons (`[2, 3, 5]`) meet minimum **24x24px** hit targets (`min-h-[24px] min-w-[24px]`).
2. **WCAG 2.2 SC 2.4.11 & 2.4.12 (Focus Not Obscured / Focus Appearance)**: Ensure keyboard focus makes the buttons visible with token-driven focus outline rings (`:focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]`), and expose flyout on focus (`group-focus-within/add:flex`).
3. **WCAG 2.2 SC 4.1.2 (Name, Role, Value)**: Add explicit `aria-label` to count buttons.

---

## 2. Exact Filepaths
1. `src/features/block-editor/ui/table/TableAddButton.tsx`

---

## 3. Technical Requirements

### `src/features/block-editor/ui/table/TableAddButton.tsx`
1. `ADD_BUTTON_CLASS`:
   ```tsx
   const ADD_BUTTON_CLASS = "z-[var(--osio-z-raised)] flex h-6 w-6 min-h-[24px] min-w-[24px] items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-muted)] opacity-0 shadow-[var(--osio-shadow-sm)] transition-colors transition-opacity hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] group-hover/table:opacity-100 group-focus-within/table:opacity-100";
   ```
2. Flyout container:
   Add `group-focus-within/add:flex` so keyboard focus inside keeps the flyout open:
   ```tsx
   <div className={`hidden group-hover/add:flex group-focus-within/add:flex ${isColumn ? "flex-col" : "flex-row"} items-center gap-0.5 rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-1 py-0.5 shadow-[var(--osio-shadow-menu)]`}>
   ```
3. Quick-count buttons:
   ```tsx
   {[2, 3, 5].map((count) => (
     <button
       key={count}
       type="button"
       aria-label={`Add ${count} ${label}s`}
       title={`Add ${count} ${label}s`}
       onClick={() => onAdd(axis, count)}
       className="flex h-6 w-6 min-h-[24px] min-w-[24px] items-center justify-center rounded-md text-2xs font-semibold leading-5 text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
     >
       {count}
     </button>
   ))}
   ```

---

## 4. Verification Protocol (Docker-First)
1. `npm run test:quality` -> 0 errors.
2. `npm run test:e2e -- tests/e2e/visual/a11y.spec.mjs` -> 5/5 pass (0 violations).

---

## 5. Commit Plan
1. Commit 1: `fix(a11y): upgrade table add button and flyout to 24px target size with focus rings`
   - Files: `src/features/block-editor/ui/table/TableAddButton.tsx`, `TASK_SPEC.md`
   - Author: `DJSurgeon <djsurgeon83@gmail.com>`
   - Flag: `-s`
2. Commit 2: `docs(changelog): document table add button touch target and focus ring upgrade`
   - Files: `docs/CHANGELOG.md`
   - Author: `DJSurgeon <djsurgeon83@gmail.com>`
   - Flag: `-s`

---

## 6. Done-When
- [x] `TableAddButton.tsx` updated with 24x24px dimensions and `:focus-visible` styling.
- [x] `npm run test:quality` passes (0 errors).
- [x] A11y tests pass with 0 violations.
- [ ] Both micro-commits created with `-s` signed by `DJSurgeon`.

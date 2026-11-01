# TASK SPEC: Batch 2 (Database Views & Row Controls), Component 3 — Remediate MemoTableRow Controls

## 1. Goal
Upgrade the database view table row drag grip and sub-items chevron in `src/shared/notion-database-sys/src/components/views/table/MemoTableRow.tsx` to satisfy:
1. **WCAG 2.2 SC 2.5.8 (Target Size - Minimum)**: Increase hit target from 14x18px to minimum **24x24px** (`flex h-6 w-6 min-h-[24px] min-w-[24px]`).
2. **WCAG 2.2 SC 2.4.11 & 2.4.12 (Focus Not Obscured / Focus Appearance)**: Enable keyboard navigation (`tabIndex={0}`), reveal row controls on focus (`focus-within:opacity-100`), and add token-driven outline rings (`:focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]`).
3. **Preserve Content Clearance**: Expand `floatingLanePadding` to `pl-8` (and `pl-14` for both grip + chevron) ensuring the 24px grip maintains `gap >= 2px` from the cell text.

---

## 2. Exact Filepaths
1. `src/shared/notion-database-sys/src/components/views/table/MemoTableRow.tsx`
2. `tests/e2e/bridge-stub/tableRowGrip.spec.mjs`

---

## 3. Technical Requirements

### `src/shared/notion-database-sys/src/components/views/table/MemoTableRow.tsx`
1. `RowControls` wrapper:
   Add `focus-within:opacity-100`:
   ```tsx
   <div className={cn(`${place} flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100`)}
     onMouseDown={e => e.stopPropagation()}>
   ```
2. `showGrip` button:
   Set `tabIndex={0}`, add `flex h-6 w-6 min-h-[24px] min-w-[24px] items-center justify-center rounded` and `:focus-visible` styling.
3. `subItems` button:
   Add `flex h-6 w-6 min-h-[24px] min-w-[24px] items-center justify-center rounded` and `:focus-visible` styling.
4. `floatingLanePadding`:
   Adjust padding to `pl-8` (and `pl-14` when both present).

---

## 4. Verification Protocol (Docker-First)
1. RED Phase: `PLAYWRIGHT_BRIDGE_STUB=1 npm run test:e2e -- tests/e2e/bridge-stub/tableRowGrip.spec.mjs` failed with `expected >= 24, received 14` (Verified).
2. GREEN Phase: `PLAYWRIGHT_BRIDGE_STUB=1 npm run test:e2e -- tests/e2e/bridge-stub/tableRowGrip.spec.mjs` -> 2/2 passed.
3. Quality Gate: `npm run test:quality` -> 0 errors.

---

## 5. Commit Plan
1. Commit 1 (RED): `test(table): assert WCAG 2.2 target size and keyboard focusability on row drag grip` [DONE: `67a37511`]
2. Commit 2 (GREEN): `fix(a11y): upgrade database table row grip and chevron to 24px with focus rings`
   - Files: `src/shared/notion-database-sys/src/components/views/table/MemoTableRow.tsx`, `TASK_SPEC.md`
   - Author: `DJSurgeon <djsurgeon83@gmail.com>`
   - Flag: `-s`
3. Commit 3 (DOCS): `docs(changelog): document database view row controls touch target and focus upgrade`
   - Files: `docs/CHANGELOG.md`
   - Author: `DJSurgeon <djsurgeon83@gmail.com>`
   - Flag: `-s`

---

## 6. Done-When
- [x] RED test written and verified failing in Docker.
- [x] `MemoTableRow.tsx` updated with 24x24px dimensions, `tabIndex={0}`, `:focus-visible` rings, and `pl-8` lane padding.
- [x] `tableRowGrip.spec.mjs` passes 2/2 in Docker.
- [x] `npm run test:quality` passes (0 errors).
- [ ] Commits created with `-s` signed by `DJSurgeon`.

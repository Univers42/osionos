# TASK SPEC: Batch 2 (Database Views & Row Controls), Component 5 — Remediate TableHeader Controls

## 1. Goal
Upgrade the database view table header buttons in `src/shared/notion-database-sys/src/components/views/table/TableHeader.tsx` to satisfy:
1. **WCAG 2.2 SC 2.5.8 (Target Size - Minimum)**: Increase "Add property" and "Column options" hit targets from 20x20px (`p-1` around 16x16 icon) to minimum **24x24px** (`flex h-6 w-6 min-h-[24px] min-w-[24px] items-center justify-center`).
2. **WCAG 2.2 SC 2.4.11 & 2.4.12 (Focus Not Obscured / Focus Appearance)**: Add token-driven outline rings (`:focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]`) to "Add property", "Column options", and column header trigger buttons.

---

## 2. Exact Filepaths
1. `src/shared/notion-database-sys/src/components/views/table/TableHeader.tsx`
2. `tests/e2e/bridge-stub/tableRowGrip.spec.mjs`

---

## 3. Technical Requirements

### `src/shared/notion-database-sys/src/components/views/table/TableHeader.tsx`
1. Column header title button (line 137-139):
   Replace `outline-none` with `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]`.
2. "Add property" button (line 165):
   ```tsx
   <button
     ref={addBtnRef}
     onClick={openAddPanel}
     aria-label="Add property"
     className={cn("mx-auto flex h-6 w-6 min-h-[24px] min-w-[24px] items-center justify-center rounded text-ink-muted hover:bg-hover-surface3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] transition-colors")}
   >
     <Plus className={cn("w-4 h-4")} />
   </button>
   ```
3. "Column options" button (line 185):
   ```tsx
   <button
     aria-label="Column options"
     className={cn("flex h-6 w-6 min-h-[24px] min-w-[24px] items-center justify-center rounded text-ink-muted hover:bg-hover-surface3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] transition-colors")}
   >
     <MoreHorizontal className={cn("w-4 h-4")} />
   </button>
   ```

---

## 4. Verification Protocol (Docker-First)
1. RED Phase: `PLAYWRIGHT_BRIDGE_STUB=1 npm run test:e2e -- tests/e2e/bridge-stub/tableRowGrip.spec.mjs` fails with `expected >= 24, received 20`.
2. GREEN Phase: `PLAYWRIGHT_BRIDGE_STUB=1 npm run test:e2e -- tests/e2e/bridge-stub/tableRowGrip.spec.mjs` passes all tests.
3. Quality Gate: `npm run test:quality` -> 0 errors.

---

## 5. Commit Plan
1. Commit 1 (RED): `test(table): assert WCAG 2.2 target size on table header action buttons`
   - Files: `tests/e2e/bridge-stub/tableRowGrip.spec.mjs`
   - Author: `DJSurgeon <djsurgeon83@gmail.com>`
   - Flag: `-s`
2. Commit 2 (GREEN): `fix(a11y): upgrade table header buttons to 24px with focus rings`
   - Files: `src/shared/notion-database-sys/src/components/views/table/TableHeader.tsx`, `TASK_SPEC.md`
   - Author: `DJSurgeon <djsurgeon83@gmail.com>`
   - Flag: `-s`
3. Commit 3 (DOCS): `docs(changelog): document database view header action buttons touch target and focus upgrade`
   - Files: `docs/CHANGELOG.md`
   - Author: `DJSurgeon <djsurgeon83@gmail.com>`
   - Flag: `-s`

---

## 6. Done-When
- [x] RED test written and verified failing in Docker (`Expected >= 24, Received 20` / `/focus-visible:ring-2/`).
- [x] `TableHeader.tsx` updated with 24x24px dimensions and `:focus-visible` outline rings.
- [x] `tableRowGrip.spec.mjs` passes in Docker.
- [x] `npm run test:quality` passes (0 errors).
- [x] All 3 micro-commits created with `-s` signed by `DJSurgeon`.

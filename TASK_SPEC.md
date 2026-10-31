# TASK SPEC: Batch 1, Component 1 — Remediate Block Collapse Toggles

## 1. Goal
Ensure collapse/expand chevrons in `BlockCollapseToggle.tsx` and `ToggleBlockEditor.tsx` meet WCAG 2.2 SC 2.5.8 (Target Size Minimum >= 24x24 px) and SC 2.4.11 / 2.4.12 (Focus Visible), preserving exact text baseline and margin alignment.

---

## 2. Exact Filepaths
1. `src/features/block-editor/ui/BlockCollapseToggle.tsx`
2. `src/features/block-editor/ui/ToggleBlockEditor.tsx`
3. `tests/e2e/visual/a11y.spec.mjs`

---

## 3. Technical Requirements

### A. `src/features/block-editor/ui/BlockCollapseToggle.tsx`
- Replace line 25:
  ```tsx
  className="mt-0.5 -ml-0.5 flex h-6 w-6 min-h-[24px] min-w-[24px] shrink-0 items-center justify-center rounded-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
  ```
- Keep icon `<ChevronRight size={14} ... />` centered.

### B. `src/features/block-editor/ui/ToggleBlockEditor.tsx`
- In lines 135-142:
  ```tsx
  <div className="flex items-start gap-0.5">
    <button
      type="button"
      onClick={handleToggle}
      aria-label={expanded ? "Collapse toggle" : "Expand toggle"}
      aria-expanded={expanded}
      className={`osio-line-marker ${getToggleHeadingClass(block.headingLevel)} -ml-0.5 shrink-0 w-6 h-6 min-w-[24px] min-h-[24px] rounded-xs hover:bg-[var(--osio-bg-hover)] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]`}
    >
      <ChevronRight
        size={14}
        className={[
          "text-[var(--osio-fg-muted)] transition-transform duration-(--osio-dur-fast)",
          expanded ? "rotate-90" : "",
        ].join(" ")}
      />
    </button>
  ```

### C. `tests/e2e/visual/a11y.spec.mjs`
- In scenario `"a11y: block editor surface with blocks"`:
  - Add a toggle block via slash command `await createBlockViaSlash(page, "toggle", "Toggle", 2);`
  - Run audit and assert `expect(results.violations).toEqual([]);`.

---

## 4. Verification Protocol (Docker-First)
- `npm run test:quality`
- `npm run test:e2e -- tests/e2e/visual/a11y.spec.mjs`

---

## 5. Commit Plan
- Message: `fix(a11y): upgrade block collapse chevrons to 24px target size with focus rings`
- Author: `DJSurgeon <djsurgeon83@gmail.com>`
- Flag: `-s`

---

## 6. Done-When
- [x] `BlockCollapseToggle.tsx` updated with 24x24 px button and `:focus-visible` ring.
- [x] `ToggleBlockEditor.tsx` updated with 24x24 px button and `:focus-visible` ring.
- [x] `a11y.spec.mjs` tests toggle block with 0 violations.
- [x] `npm run test:quality` passes (0 errors).
- [x] Commit signed with `-s` by `DJSurgeon`.

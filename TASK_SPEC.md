# TASK SPEC: Batch 1, Component 4 — Remediate FormatGrid Color Controls & Target Size

## 1. Goal
Remediate `FormatGrid.tsx` color controls to satisfy WCAG 2.2 SC 2.5.8 (Target Size Minimum >= 24x24 px), eliminate target overlap between text and background color buttons, and provide token-driven `:focus-visible` rings, while preserving all existing selection toolbar functionality and test compatibility.

---

## 2. Exact Filepaths
1. `src/components/blocks/selection-toolbar/FormatGrid.tsx`
2. `tests/e2e/visual/a11y.spec.mjs`

---

## 3. Technical Requirements

### `src/components/blocks/selection-toolbar/FormatGrid.tsx`
1. **Separate Background Color into Dedicated Toolbar Button**:
   - Replace the 16x16 px absolute button (`h-4 w-4`) inside the text color cell with a standalone `ToolbarIconButton`:
     ```tsx
     <ToolbarIconButton
       label="Background color"
       active={palette === "background"}
       onClick={() => onTogglePalette("background")}
     >
       <Highlighter className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
     </ToolbarIconButton>
     ```
   - Standard 36x36 px touch target (`h-9 w-9`), with full focus styling and zero target overlap.

2. **Update Grid Layout**:
   - Switch container grid from `grid-cols-5` to `grid-cols-6`:
     ```tsx
     <div className="grid grid-cols-6 justify-items-center gap-y-1">
     ```
   - Row 1: Text color, Background color, Bold, Italic, Underline, Clear formatting
   - Row 2: Add link, Strikethrough, Inline code, Equation, MoreMenu

### `tests/e2e/visual/a11y.spec.mjs`
- Add scenario `"a11y: inline text selection toolbar surface"`:
  - Create paragraph, select text to trigger `[data-testid="inline-selection-toolbar"]`.
  - Run `runA11yAudit(page, "inline text selection toolbar surface")`.
  - Assert `expect(results.violations).toEqual([]);`.

---

## 4. Verification Protocol (Docker-First)
1. `npm run test:quality` -> 0 errors.
2. `npm run test:e2e -- tests/e2e/functional/selectionPanel.spec.mjs` -> 3/3 passed.
3. `npm run test:e2e -- tests/e2e/visual/a11y.spec.mjs` -> 5/5 passed (0 violations).

---

## 5. Commit Plan
- Message: `fix(a11y): separate selection toolbar background color into 36px touch target`
- Author: `DJSurgeon <djsurgeon83@gmail.com>`
- Flag: `-s`

---

## 6. Done-When
- [x] `FormatGrid.tsx` updated with standalone `ToolbarIconButton` for background color in `grid-cols-6`.
- [x] `tests/e2e/visual/a11y.spec.mjs` tests inline selection toolbar with 0 violations.
- [x] `npm run test:quality` passes (0 errors).
- [x] `tests/e2e/functional/selectionPanel.spec.mjs` passes.
- [x] `tests/e2e/visual/a11y.spec.mjs` passes.
- [x] Commit signed with `-s` by `DJSurgeon`.
- [x] Documented in `docs/CHANGELOG.md`.

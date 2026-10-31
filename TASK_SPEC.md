# TASK SPEC: Batch 1, Component 3 — Remediate Todo Due Date Controls

## 1. Goal
Upgrade `TodoDueDate.tsx` buttons (both floating "Add date" affordance and active due date pill) to satisfy WCAG 2.2 SC 2.5.8 (Target Size >= 24x24 px) and SC 2.4.11 / 2.4.12 (Focus Visible), without causing layout shift or clipping in todo block rows.

---

## 2. Exact Filepaths
1. `src/features/block-editor/ui/TodoDueDate.tsx`

---

## 3. Technical Requirements

### `src/features/block-editor/ui/TodoDueDate.tsx`
1. **Unset state ("Add date" button, lines 51-60)**:
   - Change `h-5 w-5` to `h-6 w-6 min-h-[24px] min-w-[24px]`.
   - Adjust position from `top-1 right-1` to `top-0.5 right-1` for vertical symmetry in standard todo row height.
   - Add focus ring: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]`.
   - Maintain `aria-label="Add date"` and `aria-hidden` on `CalendarPlus` icon.

2. **Set state (Active due date button, lines 65-77)**:
   - Ensure minimum touch target height: add `min-h-[24px] px-1.5`.
   - Add focus ring: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]`.
   - Maintain truncated label and `aria-hidden` on `CalendarClock` icon.

---

## 4. Verification Protocol (Docker-First)
1. `npm run test:quality` -> 0 errors.
2. `npm run test:e2e -- tests/e2e/visual/a11y.spec.mjs` -> 0 violations.

---

## 5. Commit Plan
- Message: `fix(a11y): upgrade todo due date controls to 24px target size with focus rings`
- Author: `DJSurgeon <djsurgeon83@gmail.com>`
- Flag: `-s`

---

## 6. Done-When
- [x] `TodoDueDate.tsx` floating "Add date" button meets 24x24 px target size with focus ring.
- [x] `TodoDueDate.tsx` active date button meets 24px minimum height with focus ring.
- [x] `npm run test:quality` passes (0 errors).
- [x] `npm run test:e2e -- tests/e2e/visual/a11y.spec.mjs` passes (0 violations).
- [x] Commit signed with `-s` by `DJSurgeon`.
- [ ] Documented in `docs/CHANGELOG.md`.

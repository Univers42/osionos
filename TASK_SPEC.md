# TASK SPEC: Remediate WCAG 2.2 AA Violations Across Core Osionos Surfaces

## 1. Goal
Remediate all baseline accessibility violations discovered during Step 4:
1. `SidebarFooter.tsx`: Fix `nested-interactive`, `label-content-name-mismatch`, and `target-size` (< 24px).
2. `SlashCommandMenu.tsx`: Fix `aria-input-field-name` on `#slash-command-list`.
3. `SettingsSectionsNav.tsx`: Fix `target-size` on navigation rows.
4. `a11y.spec.mjs`: Assert zero violations across all 4 audited surfaces.

---

## 2. Exact Filepaths

1. `src/widgets/activity-rail/ui/SidebarFooter.tsx`
2. `src/features/slash-commands/ui/SlashCommandMenu.tsx`
3. `src/features/settings/ui/SettingsSectionsNav.tsx`
4. `tests/e2e/support/a11yAudit.mjs`
5. `tests/e2e/visual/a11y.spec.mjs`

---

## 3. Technical Requirements & Implementation Details

### A. `src/widgets/activity-rail/ui/SidebarFooter.tsx`
- **Issue**:
  - `<div role="button" tabIndex={0} aria-label="Invite members" ...>` wraps a `<button type="button" aria-label="Dismiss invitation" ...>` (`nested-interactive`).
  - Child text is "Invite members Collaborate with your team." while `aria-label="Invite members"` (`label-content-name-mismatch`).
  - Dismiss button has `w-5 h-5` (20x20px < 24x24px, `target-size`).
- **Fix**:
  - Remove `role="button"`, `tabIndex`, and `aria-label="Invite members"` from the outer card container `div`.
  - Wrap the content (icon + title + subtitle) in an inner `<button type="button" onClick={openInviteSettings} className="w-full text-left flex items-start gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] cursor-pointer pr-7">`. The visible text serves as its accessible name.
  - Position the dismiss button as a sibling inside the card container with `w-6 h-6 min-w-[24px] min-h-[24px] flex items-center justify-center rounded-md text-[var(--osio-fg-muted)] transition-colors duration-(--osio-dur-fast) hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]`.

### B. `src/features/slash-commands/ui/SlashCommandMenu.tsx`
- **Issue**:
  - `#slash-command-list` has `role="listbox"` with no accessible name (`aria-input-field-name`).
- **Fix**:
  - Add `aria-label="Commands"` to `<div ref={listRef} id="slash-command-list" role="listbox" ...>`.

### C. `src/features/settings/ui/SettingsSectionsNav.tsx`
- **Issue**:
  - `button[data-settings-section="library"]` flagged under `target-size` (SC 2.5.8 minimum 24px target size and spacing).
- **Fix**:
  - Ensure `SectionRow` button has `min-h-[32px]` and adequate spacing/padding so it strictly complies with 24x24px target size and does not intersect adjacent targets.

### D. `tests/e2e/support/a11yAudit.mjs`
- Improve diagnostic logging: for each violation node, log `node.failureSummary` and `node.html` to clearly display why axe flagged the node if any violations remain.

### E. `tests/e2e/visual/a11y.spec.mjs`
- Update all 4 test cases:
  - `expect(results.violations).toEqual([]);`
  - All tests must pass with 0 violations.

---

## 4. Verification Protocol (Docker-First)

Execute in Docker:
1. Primary Quality Gate:
   ```bash
   npm run test:quality
   ```
2. Playwright E2E Accessibility Suite:
   ```bash
   npm run test:e2e -- tests/e2e/visual/a11y.spec.mjs
   ```

---

## 5. Commit Plan (Atomic Micro-Commits)

1. `fix(a11y): resolve nested button, label mismatch, and target size in SidebarFooter`
   - Files: `src/widgets/activity-rail/ui/SidebarFooter.tsx`
2. `fix(a11y): add accessible name to slash command listbox`
   - Files: `src/features/slash-commands/ui/SlashCommandMenu.tsx`
3. `fix(a11y): ensure 24px target size compliance in settings nav`
   - Files: `src/features/settings/ui/SettingsSectionsNav.tsx`
4. `test(a11y): assert zero wcag violations in automated playwright suite`
   - Files: `tests/e2e/support/a11yAudit.mjs`, `tests/e2e/visual/a11y.spec.mjs`, `TASK_SPEC.md`

All commits MUST be signed:
`git commit -s --author="DJSurgeon <djsurgeon83@gmail.com>"`

---

## 6. Done-When
- [x] `SidebarFooter.tsx` remediated (no nested-interactive, no label mismatch, >= 24px dismiss button).
- [x] `SlashCommandMenu.tsx` listbox has accessible name (`aria-label="Commands"`).
- [x] `SettingsSectionsNav.tsx` target size verified.
- [x] `npm run test:e2e -- tests/e2e/visual/a11y.spec.mjs` reports 0 violations across all 4 surfaces.
- [x] `npm run test:quality` passes with 0 errors.
- [x] Commits made atomically with Conventional Commits format and `-s` by `DJSurgeon`.

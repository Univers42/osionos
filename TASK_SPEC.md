# TASK SPEC: Scaffold Automated WCAG 2.2 AA Playwright Suite & Axe Helper

## 1. Goal
Vendor standalone `axe.min.js`, implement reusable accessibility audit helper `tests/e2e/support/a11yAudit.mjs`, and establish `tests/e2e/visual/a11y.spec.mjs` to audit core Osionos surfaces (empty page, block editor, slash menu, settings).

---

## 2. Exact Filepaths

1. `tests/e2e/support/vendor/axe.min.js` (copy from `/home/sergio/prismatica/node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.min.js`)
2. `tests/e2e/support/a11yAudit.mjs` (new reusable helper)
3. `tests/e2e/visual/a11y.spec.mjs` (new Playwright audit test suite)

---

## 3. Technical Specifications & Interfaces

### A. Helper: `tests/e2e/support/a11yAudit.mjs`
- Export function `injectAxe(page)`:
  - Resolves path to `tests/e2e/support/vendor/axe.min.js`.
  - Injects via `await page.addScriptTag({ path: axePath })`.
- Export function `runA11yAudit(page, contextName, options = {})`:
  - Default tags: `['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']`.
  - Runs `window.axe.run(document, { runOnly: { type: 'tag', values: tags } })`.
  - Formats diagnostic output: logs context name, violation count, rule ID, description, impact, and target selector.
  - Returns result object `{ violations, passes, incomplete }`.

### B. Test Suite: `tests/e2e/visual/a11y.spec.mjs`
- Target: standard offline test server (`:3004`).
- Uses `openFreshPage`, `activateFirstEditor`, `createBlockViaSlash` from `../../browser/core/app.mjs`.
- Uses `openSettings` from `../support/settingsHelpers.mjs`.
- Scenarios:
  1. **Empty Document / Canvas**:
     - `await openFreshPage(page, baseURL);`
     - Run audit.
  2. **Block Editor (Headings, Paragraphs, Code, Callout)**:
     - `await openFreshPage(page, baseURL);`
     - Add paragraph, heading, code block.
     - Run audit.
  3. **Slash Command Menu Active State**:
     - `await openFreshPage(page, baseURL);`
     - Type `/` to open slash menu.
     - Wait for slash menu dropdown.
     - Run audit.
  4. **Settings Dialog**:
     - `await openFreshPage(page, baseURL);`
     - Open Settings modal via `openSettings(page)`.
     - Run audit.

---

## 4. Verification Protocol (Docker-First)

- Quality Gate:
  ```bash
  npm run test:quality
  ```
- Playwright A11y Suite Run:
  ```bash
  npm run test:e2e -- tests/e2e/visual/a11y.spec.mjs
  ```

---

## 5. Commit Plan (Atomic & Signed)

- Commit Message: `test(e2e): scaffold automated axe-core wcag 2.2 audit suite in playwright`
- Author: `DJSurgeon <djsurgeon83@gmail.com>`
- Flag: `-s` (`Signed-off-by: DJSurgeon <djsurgeon83@gmail.com>`)

---

## 6. Done-When
- [x] `tests/e2e/support/vendor/axe.min.js` copied and valid.
- [x] `tests/e2e/support/a11yAudit.mjs` implemented and exported.
- [x] `tests/e2e/visual/a11y.spec.mjs` runs through Docker Playwright runner.
- [x] `npm run test:quality` passes with 0 errors.
- [x] Commit signed with `-s` by `DJSurgeon`.

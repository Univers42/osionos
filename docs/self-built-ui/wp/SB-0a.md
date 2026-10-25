# SB-0a — Parity harness (self-built UI, phase S0)

Project: rebuild every settings section from the app's own blocks with today's exact look
(design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md`, plan:
`docs/superpowers/plans/2026-10-25-self-built-ui.md`). This package changes NO product code: it
captures today's look so later packages can prove they kept it.

**OWNS:** `tests/e2e/support/settingsParityStub.mjs` (new), `tests/e2e/bridge-stub/settingsParity.spec.mjs` (new), `.gitignore` (one line).
**MUST NOT TOUCH:** everything under `src/`, existing specs and support files (read them, reuse their exports), `playwright.config.ts`, committed PNGs.

**Exception to COMMON.md:** `--update-snapshots` is allowed for `tests/e2e/bridge-stub/settingsParity.spec.mjs` ONLY. Its snapshots are local baselines and are git-ignored; never commit a PNG.

**Commit message:** `test(settings): parity screenshots of every section at 375/1440, light and dark`

### Task 1: Parity harness (SB-0a)

**Files:**
- Create: `tests/e2e/support/settingsParityStub.mjs`, `tests/e2e/bridge-stub/settingsParity.spec.mjs`
- Modify: `.gitignore` (add `tests/e2e/bridge-stub/settingsParity.spec.mjs-snapshots/`)

**Interfaces:**
- Consumes: `region`, `nav`, `openSection`, `openSettings` (`tests/e2e/support/settingsHelpers.mjs:21-50`); `openProfile` (`tests/e2e/support/sessionsStub.mjs:56`); the stubs in `tests/e2e/support/*Stub.mjs`.
- Produces: `installParityStub(page) → Promise<{ unknown: string[] }>`; snapshot names `<sectionId>-<width>-<theme>.png`.

- [ ] **Step 1: Write the stub.** `installParityStub` routes `**/api/**`. Reuse the existing stub fixtures where they exist; every list route a section calls on open answers 2–3 fixed rows (fixed ids and dates); an unknown route answers `404 {ok:false}` and its path is pushed to `unknown`.
- [ ] **Step 2: Write the spec.** One test per (viewport, theme): `[[375, 812], [1440, 900]] × ["light", "dark"]`.
  - Before boot: `page.addInitScript` sets `localStorage["osionos:theme-mode"]`, and `page.clock.install({ time: new Date("2026-10-25T10:00:00Z") })`.
  - Boot: `openProfile(page, baseURL)`, then `openSettings(page)`.
  - Read the sections from `nav(page).locator("[data-settings-section]")`.
  - For each section: `openSection`, then `await page.evaluate(() => document.fonts.ready)`, then
    `await expect.soft(region(page)).toHaveScreenshot(\`${id}-${width}-${theme}.png\`, { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.001 })`.
  - Finally `expect(stub.unknown).toEqual([])`.
- [ ] **Step 3: Create the baselines.** Run: `PW_BROWSER_SOURCE=system PLAYWRIGHT_BRIDGE_STUB=1 bash scripts/docker-run.sh test-e2e --update-snapshots tests/e2e/bridge-stub/settingsParity.spec.mjs`. Expected: `4 passed`, about 92 PNGs written.
- [ ] **Step 4: Prove determinism.** Run the same command twice without `--update-snapshots`. Expected: `4 passed` both times. Any diff is a determinism bug (clock, fonts, random ids): fix it in the stub, never by raising the ratio.
- [ ] **Step 5: Commit.** `git add .gitignore tests/e2e/support/settingsParityStub.mjs tests/e2e/bridge-stub/settingsParity.spec.mjs && git commit -m "test(settings): parity screenshots of every section at 375/1440, light and dark"`

Caveat (goes in the spec header): baselines are local (system Chromium renders differ from the committed-PNG renderer), so parity is a review gate, not a CI gate. `groot-wt/bin/parity.sh <wt> <base-ref>` renders the baseline from the base commit in a scratch worktree and then compares.


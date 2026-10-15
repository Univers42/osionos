// Real surfaces in both modes: what a change to the shell, the page, the
// database chrome or a modal actually looks like. The clock is fixed so a date
// shown in the UI cannot move a baseline.
//
// Baselines are written by the browser-tests Docker image, the one CI runs:
//   npm run test:e2e -- tests/e2e/visual --update-snapshots

import { expect, test } from "@playwright/test";

import { clearAndTypePageTitle, openFreshPage } from "../../browser/core/app.mjs";
import { insertInlineDatabase } from "../support/databaseHelpers.mjs";

const FIXED_NOW = new Date("2026-01-15T10:00:00Z");

async function prepare(page, mode) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.addInitScript((themeMode) => {
    localStorage.setItem("osionos:theme-mode", themeMode);
  }, mode);
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
}

for (const mode of ["light", "dark"]) {
  test.describe(`surfaces, ${mode}`, () => {
    test.beforeEach(async ({ page }) => {
      await prepare(page, mode);
    });

    test("the shell with a new page", async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      await clearAndTypePageTitle(page, "Quarterly plan");
      await settle(page);
      await expect(page).toHaveScreenshot(`shell-${mode}.png`);
    });

    test("a page with an inline database", async ({ page }) => {
      const block = await insertInlineDatabase(page);
      // The block shows a loading state first; the table's own controls come
      // with its lazy chunk, so once they render the table is what is shot.
      await expect(block.locator('[aria-label="Add property"]')).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`inline-database-${mode}.png`);
    });

    test("two panes side by side", async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      await clearAndTypePageTitle(page, "Quarterly plan");
      await page.locator('button[title="Split right"]').first().click();
      await expect(page.getByRole("textbox", { name: "Page title" })).toHaveCount(2);
      await settle(page);
      await expect(page).toHaveScreenshot(`split-panes-${mode}.png`);
    });

    test("the settings modal", async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      await page.getByRole("button", { name: "Settings", exact: true }).first().click();
      // The shell's own tab strip is made of tabs too: wait for one only settings has.
      await expect(page.getByRole("tab", { name: "osionos MCP" })).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`settings-${mode}.png`);
    });
  });
}

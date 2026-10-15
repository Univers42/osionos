// The reference page in every palette and both modes. A token or palette
// change shows up here as an image diff to review, not as a surprise in the
// app. Palettes are read from the page's own control, so a new one fails this
// spec until its baseline is committed.
//
// Baselines are written by the browser-tests Docker image, the one CI runs:
//   npm run test:e2e -- tests/e2e/visual --update-snapshots

import { expect, test } from "@playwright/test";

const html = (page) => page.locator("html");

async function openStyleguide(page, baseURL, mode) {
  await page.addInitScript((themeMode) => {
    localStorage.setItem("osionos:theme-mode", themeMode);
  }, mode);
  await page.goto(`${baseURL}/__styleguide`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("styleguide").waitFor();
  await expect(html(page)).toHaveAttribute("data-theme", mode);
  await page.evaluate(() => document.fonts.ready);
}

for (const mode of ["light", "dark"]) {
  test.describe(`design system, ${mode}`, () => {
    test("colour sections in every palette", async ({ page, baseURL }) => {
      await page.setViewportSize({ width: 1024, height: 1300 });
      await openStyleguide(page, baseURL, mode);
      const select = page.getByLabel("Palette", { exact: true });
      const palettes = await select.locator("option").evaluateAll((options) => options.map((option) => option.value));
      expect(palettes.length).toBeGreaterThanOrEqual(8);
      for (const palette of palettes) {
        await select.selectOption(palette);
        await expect(html(page)).toHaveAttribute("data-palette", palette);
        await expect.soft(page).toHaveScreenshot(`palette-${palette}-${mode}.png`);
      }
    });

    test("the whole reference page in the default palette", async ({ page, baseURL }) => {
      await page.setViewportSize({ width: 1024, height: 1300 });
      await openStyleguide(page, baseURL, mode);
      const height = await page.getByTestId("styleguide").evaluate((element) => element.scrollHeight);
      await page.setViewportSize({ width: 1024, height });
      await expect(page).toHaveScreenshot(`reference-page-${mode}.png`);
    });
  });
}

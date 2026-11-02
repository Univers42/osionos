// Regression for #268: a pane's zoom reaches a database as it reaches the text.

import { expect, test } from "@playwright/test";

import { insertInlineDatabase } from "../support/databaseHelpers.mjs";

test("a zoomed pane zooms an inline database with the page text", async ({ page }) => {
  const block = await insertInlineDatabase(page);
  await page.locator("[data-osio-pane]").first().evaluate((pane) => {
    pane.style.setProperty("zoom", "0.5");
    pane.style.setProperty("--osio-pane-zoom", "0.5");
  });
  await expect
    .poll(() => block.evaluate((el) => el.currentCSSZoom))
    .toBeCloseTo(0.5);
});

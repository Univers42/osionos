// #288: a chart view logged "The width(-1) and height(-1) of chart should be greater than 0" on
// every page that held one: Recharts' container computed -1×-1 before its first measure.

import { expect, test } from "@playwright/test";

test("a chart view renders without the width(-1) and height(-1) warning", async ({ page }) => {
  const sizeWarnings = [];
  page.on("console", (message) => {
    if (/width\(-?\d+\) and height\(-?\d+\) of chart/.test(message.text())) sizeWarnings.push(message.text());
  });
  await page.goto("/?home=database");
  await page.locator('[aria-label="Add view"]').first().waitFor({ timeout: 20_000 });
  await page.locator('[aria-label="Add view"]').first().click();
  await page.getByRole("button", { name: "Chart", exact: true }).first().click();
  await page.getByRole("button", { name: "Chart", exact: true }).first().click();
  await page.getByText("Edit view", { exact: true }).click();
  await page.getByText("What to show").first().click();
  await page.getByRole("button", { name: /Theme/ }).first().click();
  await expect(page.locator(".recharts-bar-rectangle path").first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
  expect(sizeWarnings).toEqual([]);
});

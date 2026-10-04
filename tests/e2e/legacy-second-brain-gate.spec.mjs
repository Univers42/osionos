// VITE_LEGACY_SECOND_BRAIN defaults ON, so the default test build must still open
// the legacy graph through both Home entry points. Unlike the legacy-graph-*
// specs, these never skip: a canvas that fails to mount is a failure.

import { expect, test } from "@playwright/test";

const GRAPH_CANVAS = "canvas.osio-graph__fg";

test("gate on: ?home=graph deep link opens the legacy graph", async ({ page }) => {
  await page.goto("/?home=graph&graphBench=200", { waitUntil: "domcontentloaded" });
  await expect(page.locator(GRAPH_CANVAS)).toBeVisible({ timeout: 20_000 });
});

test('gate on: a stored "graph" home variant restores the legacy graph', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("osionos.home.variant", "graph");
  });
  await page.goto("/?graphBench=200", { waitUntil: "domcontentloaded" });
  await expect(page.locator(GRAPH_CANVAS)).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => localStorage.getItem("osionos.home.variant"))).toBe("graph");
});

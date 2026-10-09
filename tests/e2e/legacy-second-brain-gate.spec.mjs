// VITE_LEGACY_SECOND_BRAIN defaults OFF; a build with it set to "true" is the developer
// backup, and it must still open the legacy graph through both Home entry points. CI's
// gate-on job runs this file (playwright.config ignores it in a default build). Unlike the
// legacy-graph-* specs, these never skip: a canvas that fails to mount is a failure.

import { expect, test } from "@playwright/test";

test.beforeAll(() => {
  // Not a skip: this file only means something in a gate-on build.
  expect(process.env.VITE_LEGACY_SECOND_BRAIN, "run this file with VITE_LEGACY_SECOND_BRAIN=true").toBe("true");
});

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

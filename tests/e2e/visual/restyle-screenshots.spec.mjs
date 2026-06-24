// Warm-editorial restyle — per-wave visual capture (light + dark).
// Run: pnpm exec playwright test tests/e2e/visual/restyle-screenshots.spec.mjs
// Output: test-results/restyle/<theme>-<surface>.png  (diff before/after per wave).
import { test } from "@playwright/test";

const SURFACES = [
  { name: "home", path: "/" },
];

for (const theme of ["light", "dark"]) {
  for (const surface of SURFACES) {
    test(`restyle ${theme} ${surface.name}`, async ({ page }) => {
      // theme.ts reads this on init and sets data-theme on <html>.
      await page.addInitScript((t) => {
        try {
          localStorage.setItem("osionos:theme-mode", t);
        } catch {
          /* storage may be unavailable; default theme is fine */
        }
      }, theme);
      await page.goto(surface.path, { waitUntil: "domcontentloaded" });
      // let lazy chunks + first paint of the editor settle
      await page.waitForTimeout(4000);
      await page.screenshot({
        path: `test-results/restyle/${theme}-${surface.name}.png`,
      });
    });
  }
}

// Glass costs a gradient canvas and a translucent sidebar card, and no backdrop blur on the card.
// Three interactions run in glass and each must stay within 20 ms p95 of the method's own floor
// (and 20 ms median over it): a preset click, a hover over sidebar rows, a menu opening.
//
// Caveat: headless software rendering makes these an upper bound on a GPU run; "painted" is the
// second rAF after the input, so real presentation is up to a vsync later (see perfHarness.mjs).

import { expect, test } from "@playwright/test";

import { PERF_USE, bootApp, measureFloor, measureToPaint, writeReport } from "./perfHarness.mjs";

test.use(PERF_USE);

const SPEC = "surfaceGlass";
const HEADROOM_MS = 20;

const setSurface = (page, surface) => page.evaluate((s) => (document.documentElement.dataset.surface = s), surface);

/** Writes the run and fails when glass is further from the floor than the headroom. */
function judge(name, floor, stats) {
  writeReport(SPEC, name, { floor, glass: { stats } });
  expect(stats.p95, `${name}: p95 ${stats.p95} vs floor p95 ${floor.p95} + ${HEADROOM_MS}`).toBeLessThanOrEqual(floor.p95 + HEADROOM_MS);
  expect(stats.median - floor.median, `${name}: median over floor`).toBeLessThanOrEqual(HEADROOM_MS);
}

test("clicking the Aurora preset", async ({ page }) => {
  test.setTimeout(300_000);
  await bootApp(page);
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Preferences" }).click();
  const style = page.getByRole("group", { name: "Style" });
  const floor = await measureFloor(page);
  const stats = await measureToPaint(page, () => style.getByRole("radio", { name: /Aurora/ }).check({ force: true }), {
    runs: 20, warmups: 3, startEvent: "click", until: { selector: 'html[data-surface="glass"]' },
    before: () => style.getByRole("radio", { name: /Calm/ }).check({ force: true }),
  });
  judge("presetClick", floor, stats);
});

test("hovering sidebar rows in glass", async ({ page }) => {
  test.setTimeout(300_000);
  await bootApp(page);
  await page.evaluate(() => globalThis.__perfSeedPages?.(40));
  await setSurface(page, "glass");
  const rows = page.getByRole("treeitem");
  await rows.nth(1).waitFor();
  const [a, b] = [await rows.nth(0).boundingBox(), await rows.nth(1).boundingBox()];
  const floor = await measureFloor(page);
  let toggle = false;
  const stats = await measureToPaint(page, () => {
    toggle = !toggle;
    const at = toggle ? a : b;
    return page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  }, { runs: 20, warmups: 3, startEvent: "pointermove" });
  judge("sidebarHover", floor, stats);
});

test("opening the page menu in glass", async ({ page }) => {
  test.setTimeout(300_000);
  await bootApp(page);
  const seed = await page.evaluate(() => globalThis.__perfSeed(60));
  const editor = page.locator(`[data-block-id="${seed.typedBlockId.replace(/-0$/, "")}-7"] [contenteditable="true"]`);
  await editor.scrollIntoViewIfNeeded();
  await editor.click();
  await setSurface(page, "glass");
  const open = page.getByRole("button", { name: "Open page configuration" }).first();
  const floor = await measureFloor(page);
  const stats = await measureToPaint(page, () => open.click(), {
    runs: 20, warmups: 3, startEvent: "click", until: { selector: '[data-testid="page-config-menu"]' },
    before: () => page.keyboard.press("Escape"),
  });
  judge("menuOpen", floor, stats);
});

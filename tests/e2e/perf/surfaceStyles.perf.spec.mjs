// Frosted surfaces cost a backdrop blur per floating panel. Each case runs solid, then frosted, and
// the frosted run must stay within 20 ms p95 of the method's own floor and 20 ms median over it.
// The worst frame (longest rAF gap, and the longest Long Animation Frame where Chromium has it) is
// recorded for the typing and scrolling cases.
//
// Caveat: headless Chromium blurs in software, so the numbers are an upper bound on a GPU run;
// the rAF gap counts only frames the page asked for, so a stall outside them is seen by LoAF alone.

import { expect, test } from "@playwright/test";

import { PERF_USE, bootApp, measureFloor, measureToPaint, writeReport } from "./perfHarness.mjs";

test.use(PERF_USE);

const SPEC = "surfaceStyles";
const HEADROOM_MS = 20;
const SURFACES = ["solid", "frosted"];

const setSurface = (page, surface) => page.evaluate((s) => (s === "solid" ? delete document.documentElement.dataset.surface : (document.documentElement.dataset.surface = s)), surface);

/** Starts a rAF gap recorder and a LoAF observer; the returned function stops them and reads the worst frame. */
async function recordFrames(page) {
  await page.evaluate(() => {
    const rec = { gaps: [], loaf: [], live: true };
    let last = performance.now();
    const tick = (now) => {
      rec.gaps.push(now - last);
      last = now;
      if (rec.live) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      new PerformanceObserver((list) => list.getEntries().forEach((e) => rec.loaf.push(e.duration))).observe({ type: "long-animation-frame", buffered: false });
    } catch {
      rec.loaf = null;
    }
    globalThis.__frames = rec;
  });
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return page.evaluate(() => {
      const rec = globalThis.__frames;
      rec.live = false;
      return { worstGap: Math.max(...rec.gaps), worstLoaf: rec.loaf ? Math.max(0, ...rec.loaf) : null };
    });
  };
}

/** Writes both runs and fails when the frosted one is further from the floor than the headroom. */
function judge(name, floor, runs) {
  writeReport(SPEC, name, { floor, ...runs });
  const frosted = runs.frosted.stats;
  expect(frosted.p95, `${name}: p95 ${frosted.p95} vs floor p95 ${floor.p95} + ${HEADROOM_MS}`).toBeLessThanOrEqual(floor.p95 + HEADROOM_MS);
  expect(frosted.median - floor.median, `${name}: median over floor`).toBeLessThanOrEqual(HEADROOM_MS);
}

async function seeded(page) {
  await bootApp(page);
  const seed = await page.evaluate(() => globalThis.__perfSeed(600));
  const editor = page.locator(`[data-block-id="${seed.typedBlockId.replace(/-0$/, "")}-7"] [contenteditable="true"]`);
  await editor.scrollIntoViewIfNeeded();
  await editor.click();
  await page.keyboard.press("End");
  return editor;
}

async function bothSurfaces(page, run) {
  const out = {};
  for (const surface of SURFACES) {
    await setSurface(page, surface);
    out[surface] = await run();
  }
  return out;
}

test("typing under an open frosted slash menu", async ({ page }) => {
  test.setTimeout(300_000);
  await seeded(page);
  await page.keyboard.type("/h");
  await page.getByTestId("slash-command-menu").waitFor();
  const floor = await measureFloor(page);
  const runs = await bothSurfaces(page, async () => {
    const stop = await recordFrames(page);
    const stats = await measureToPaint(page, () => page.keyboard.press("e"), { runs: 20, warmups: 3, before: () => page.keyboard.press("Backspace") });
    return { stats, ...(await stop()) };
  });
  judge("typingUnderSlashMenu", floor, runs);
});

test("scrolling a long page under an open frosted popover", async ({ page }) => {
  test.setTimeout(300_000);
  await seeded(page);
  await page.getByRole("button", { name: "Open page configuration" }).first().click();
  await page.getByTestId("page-config-menu").waitFor();
  const floor = await measureFloor(page);
  const runs = await bothSurfaces(page, async () => {
    const stop = await recordFrames(page);
    await page.mouse.move(700, 400);
    const stats = await measureToPaint(page, () => page.mouse.wheel(0, 240), { runs: 20, warmups: 3, startEvent: "wheel", before: () => page.mouse.wheel(0, -240) });
    return { stats, ...(await stop()) };
  });
  judge("scrollUnderPopover", floor, runs);
});

test("opening the page menu on frosted", async ({ page }) => {
  test.setTimeout(300_000);
  await seeded(page);
  const open = page.getByRole("button", { name: "Open page configuration" }).first();
  const floor = await measureFloor(page);
  const runs = await bothSurfaces(page, async () => ({
    stats: await measureToPaint(page, () => open.click(), { runs: 20, warmups: 3, startEvent: "click", until: { selector: '[data-testid="page-config-menu"]' }, before: () => page.keyboard.press("Escape") }),
  }));
  judge("menuOpen", floor, runs);
});

test("clicking a style preset", async ({ page }) => {
  test.setTimeout(300_000);
  await bootApp(page);
  await page.getByRole("tab", { name: "Settings", exact: true }).first().click();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Preferences" }).click();
  const style = page.getByRole("group", { name: "Style" });
  const calm = style.getByRole("radio", { name: /Classic/ });
  const frost = style.getByRole("radio", { name: /Frost/ });
  const floor = await measureFloor(page);
  const stats = await measureToPaint(page, () => frost.check({ force: true }), { runs: 20, warmups: 3, startEvent: "click", until: { selector: 'html[data-surface="frosted"]' }, before: () => calm.check({ force: true }) });
  judge("presetClick", floor, { solid: { stats }, frosted: { stats } });
});

/** Same click as above while the neon-tokyo theme pins its own surface tokens; p95 must stay within 16 ms of the floor. */
test("clicking a style preset under neon-tokyo", async ({ page }) => {
  test.setTimeout(300_000);
  await bootApp(page);
  await page.evaluate(async () => {
    const { SHIPPED_THEMES } = await import("/src/shared/config/themes/index.ts");
    const { compileTheme } = await import("/src/shared/config/themeDoc.ts");
    const { applyCompiledTheme } = await import("/src/shared/config/themeApply.ts");
    applyCompiledTheme(compileTheme(SHIPPED_THEMES.find((theme) => theme.name === "Neon Tokyo")));
  });
  await page.getByRole("tab", { name: "Settings", exact: true }).first().click();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Preferences" }).click();
  const style = page.getByRole("group", { name: "Style" });
  const calm = style.getByRole("radio", { name: /Classic/ });
  const aurora = style.getByRole("radio", { name: /Aurora/ });
  const floor = await measureFloor(page);
  const stats = await measureToPaint(page, () => aurora.check({ force: true }), { runs: 20, warmups: 3, startEvent: "click", until: { selector: 'html[data-surface="glass"]' }, before: () => calm.check({ force: true }) });
  writeReport(SPEC, "presetClickNeonTokyo", { floor, stats });
  expect(stats.p95, `p95 ${stats.p95} vs floor p95 ${floor.p95} + 16`).toBeLessThanOrEqual(floor.p95 + 16);
});

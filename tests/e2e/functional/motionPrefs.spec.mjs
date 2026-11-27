// Motion preferences: a page or tab transition, a menu and dialog transition and an animation
// speed, written to <html> by the appearance store, mirrored before first paint by index.html and
// forced off by a reduced-motion setting. Ponytail: the animation is read two frames after the
// click, so a transition shorter than ~40 ms (a "fast" speed on a slow runner) could be missed.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const html = (page) => page.locator("html");
const storedAppearance = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("osionos:appearance") ?? "null"));

async function seed(page, appearance) {
  await page.route("**/*", (route) => (route.request().method() === "GET" ? route.fallback() : route.abort()));
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem("motion-seeded")) return;
    sessionStorage.setItem("motion-seeded", "1");
    localStorage.setItem("osionos:theme-mode", "light");
    if (raw !== null) localStorage.setItem("osionos:appearance", raw);
  }, appearance === undefined ? null : JSON.stringify(appearance));
}

/** Clicks the first inactive tab, waits two frames, and reports the page-transition animations on the visible tab. */
function switchTabAndReadAnimations(page) {
  return page.evaluate(async () => {
    document.querySelector("[data-tab-id]:not([data-active])").click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const visible = document.querySelectorAll("[data-tab-visible]");
    return [...visible].flatMap((element) => element.getAnimations())
      .filter((animation) => animation.animationName?.startsWith("osio-page-"))
      .map((animation) => ({ name: animation.animationName, duration: animation.effect.getComputedTiming().duration }));
  });
}

async function openMotionSettings(page) {
  await page.getByRole("tab", { name: "Settings", exact: true }).first().click();
  await page.getByRole("region", { name: "Settings", exact: true }).waitFor();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Preferences" }).click();
  await page.getByTestId("motion-controls").waitFor();
}

test.describe("motion preferences", () => {
  test("a stored blur is on <html> at first paint and runs when a tab is switched to", async ({ page, baseURL }) => {
    await seed(page, { pageTransition: "blur" });
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await expect(html(page)).toHaveAttribute("data-page-transition", "blur");
    await openFreshPage(page, baseURL);
    const animations = await switchTabAndReadAnimations(page);
    expect(animations.map((animation) => animation.name)).toContain("osio-page-blur");
    expect(Math.max(...animations.map((animation) => animation.duration))).toBeGreaterThan(100);
  });

  test("reduced motion collapses the transition to under a millisecond", async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seed(page, { pageTransition: "blur" });
    await openFreshPage(page, baseURL);
    const animations = await switchTabAndReadAnimations(page);
    expect(animations.length).toBeGreaterThan(0);
    for (const animation of animations) expect(animation.duration).toBeLessThanOrEqual(1);
  });

  test("by default nothing is written and the visible tab does not animate", async ({ page, baseURL }) => {
    await seed(page);
    await openFreshPage(page, baseURL);
    await expect(html(page)).not.toHaveAttribute("data-page-transition", /.*/);
    await expect(html(page)).not.toHaveAttribute("data-overlay-transition", /.*/);
    await expect(html(page)).not.toHaveAttribute("data-motion-speed", /.*/);
    expect(await switchTabAndReadAnimations(page)).toEqual([]);
  });

  test("the Motion block sets and stores the transition, and passes axe in both themes", async ({ page, baseURL }) => {
    await seed(page);
    await openFreshPage(page, baseURL);
    await openMotionSettings(page);
    await page.getByRole("group", { name: "Page and tab transition" }).getByRole("tab", { name: "Slide" }).click();
    await expect(html(page)).toHaveAttribute("data-page-transition", "slide");
    expect((await storedAppearance(page)).pageTransition).toBe("slide");
    await page.getByRole("group", { name: "Animation speed" }).getByRole("tab", { name: "Fast" }).click();
    await expect(html(page)).toHaveAttribute("data-motion-speed", "fast");
    for (const theme of ["light", "dark"]) {
      await page.getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click();
      await expect(html(page)).toHaveAttribute("data-theme", theme);
      const { violations } = await new AxeBuilder({ page }).include('[data-testid="motion-controls"]').withTags(WCAG_AA).analyze();
      expect(violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(" ")}`)).toEqual([]);
    }
  });
});

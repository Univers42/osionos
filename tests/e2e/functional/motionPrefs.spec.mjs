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

  test.describe("an explicit motion choice beats the theme", () => {
    const token = (page, name) => page.evaluate((property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(), name);
    const normalise = (curve) => curve.replace(/\s+/g, "").replace(/(^|[(,])\./g, "$10.");
    const choose = (page, group, name) => page.getByRole("group", { name: group, exact: true }).getByRole("tab", { name }).click();

    async function openWithMeadow(page, baseURL) {
      await seed(page);
      await openFreshPage(page, baseURL);
      await openMotionSettings(page);
      await page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: /Meadow/ }).check({ force: true });
      await expect.poll(() => token(page, "--osio-dur-base")).toBe("320ms");
    }

    test("Animation speed overrides Meadow's durations and Default hands them back", async ({ page, baseURL }) => {
      await openWithMeadow(page, baseURL);
      await choose(page, "Animation speed", "Fast");
      await expect.poll(() => token(page, "--osio-dur-base")).toBe("108ms");
      await choose(page, "Animation speed", "Default");
      await expect.poll(() => token(page, "--osio-dur-base")).toBe("320ms");
    });

    test("Easing style overrides Meadow's curve and Standard hands it back", async ({ page, baseURL }) => {
      await openWithMeadow(page, baseURL);
      await choose(page, "Easing style", "Bouncy");
      await expect.poll(async () => normalise(await token(page, "--osio-ease-standard"))).toBe("cubic-bezier(0.34,1.56,0.64,1)");
      await choose(page, "Easing style", "Standard");
      await expect.poll(async () => normalise(await token(page, "--osio-ease-standard"))).toBe("cubic-bezier(0.33,1,0.68,1)");
    });

    test("the chosen easing is on <html> at first paint", async ({ page, baseURL }) => {
      await seed(page, { easing: "snappy", pressFeedback: "squish" });
      await page.goto(baseURL, { waitUntil: "commit" });
      await expect(html(page)).toHaveAttribute("data-easing", "snappy");
      await expect(html(page)).toHaveAttribute("data-press-feedback", "squish");
    });
  });

  test.describe("button press", () => {
    const pressedScale = async (page) => {
      const button = page.getByRole("group", { name: "Animation speed", exact: true }).getByRole("tab", { name: "Default" });
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      const scale = await button.evaluate((element) => getComputedStyle(element).scale);
      await page.mouse.up();
      return scale;
    };

    test("Squish presses a button to 0.96, and reduced motion keeps it still", async ({ page, baseURL }) => {
      await seed(page, { pressFeedback: "squish" });
      await openFreshPage(page, baseURL);
      await openMotionSettings(page);
      expect(await pressedScale(page)).toBe("0.96");
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(await pressedScale(page)).toBe("none");
    });

    test("None cancels an ad hoc press scale (no active:scale-* button is visible here, so a stand-in carries one)", async ({ page, baseURL }) => {
      await seed(page, { pressFeedback: "none" });
      await openFreshPage(page, baseURL);
      await page.addStyleTag({ content: ".press-probe:active { scale: 0.95; }" });
      await page.evaluate(() => {
        const probe = document.createElement("button");
        probe.className = "press-probe";
        probe.textContent = "probe";
        probe.style.cssText = "position:fixed;top:40px;left:40px;width:80px;height:40px;z-index:99999";
        document.body.append(probe);
      });
      const probe = page.locator(".press-probe");
      const box = await probe.boundingBox();
      await page.mouse.move(box.x + 10, box.y + 10);
      await page.mouse.down();
      expect(await probe.evaluate((element) => getComputedStyle(element).scale)).toBe("none");
      await page.mouse.up();
    });
  });

  test("Easing style and Button press pass axe in both themes", async ({ page, baseURL }) => {
    await seed(page);
    await openFreshPage(page, baseURL);
    await openMotionSettings(page);
    await page.getByRole("group", { name: "Easing style", exact: true }).getByRole("tab", { name: "Bouncy" }).click();
    await page.getByRole("group", { name: "Button press", exact: true }).getByRole("tab", { name: "Squish" }).click();
    for (const theme of ["light", "dark"]) {
      await page.getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click();
      await expect(html(page)).toHaveAttribute("data-theme", theme);
      const { violations } = await new AxeBuilder({ page }).include('[data-testid="motion-controls"]').withTags(WCAG_AA).analyze();
      expect(violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(" ")}`)).toEqual([]);
    }
  });
});

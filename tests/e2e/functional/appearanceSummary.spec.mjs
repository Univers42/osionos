// Settings > Preferences > Your changes: a chip per appearance axis off its default, each a jump
// to where it is set, and a one-line description under each appearance section. Ponytail: the
// viewport check reads the target after Playwright's auto-retry, so a jump that lands only after a
// long smooth scroll is still accepted.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { isPhoneWidth, openSettingsOnPhone } from "../support/phoneNav.mjs";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const region = (page) => page.getByRole("region", { name: "Settings", exact: true });
const summary = (page) => page.getByTestId("appearance-summary");
const chips = (page) => summary(page).getByRole("listitem");
const anchor = (page, id) => region(page).locator(`[data-settings-anchor="${id}"]`);

async function start(page, baseURL, viewport) {
  if (viewport) await page.setViewportSize(viewport);
  await page.route("**/*", (route) => (route.request().method() === "GET" ? route.fallback() : route.abort()));
  await page.addInitScript(() => {
    if (sessionStorage.getItem("summary-seeded")) return;
    sessionStorage.setItem("summary-seeded", "1");
    localStorage.setItem("osionos:theme-mode", "light");
  });
  await openFreshPage(page, baseURL);
  if (viewport && isPhoneWidth(page)) await openSettingsOnPhone(page);
  else await page.getByRole("tab", { name: "Settings", exact: true }).first().click();
  await region(page).waitFor();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Preferences" }).click();
  await summary(page).waitFor();
}

const choose = (page, group, name) => page.getByRole("group", { name: group, exact: true }).getByRole("tab", { name, exact: true }).click();

test.describe("appearance summary", () => {
  test("a fresh profile is at its default with no chips", async ({ page, baseURL }) => {
    await start(page, baseURL);
    await expect(summary(page)).toContainText("Everything is at its default.");
    await expect(chips(page)).toHaveCount(0);
  });

  test("changed axes appear as chips, jump to their row or section, and leave when reset", async ({ page, baseURL }) => {
    await start(page, baseURL);
    await choose(page, "Corners", "Round");
    await choose(page, "Animation speed", "Fast");
    await expect(summary(page)).toContainText("2 settings changed from the default.");
    await expect(summary(page).getByRole("button", { name: "Corners: Round, go to setting" })).toHaveText("Corners: Round");
    await expect(summary(page).getByRole("button", { name: "Animation speed: Fast, go to setting" })).toHaveText("Animation speed: Fast");

    await anchor(page, "layout").getByRole("heading", { name: "Layout and text" }).scrollIntoViewIfNeeded();
    await summary(page).scrollIntoViewIfNeeded();
    await summary(page).getByRole("button", { name: /^Animation speed: Fast/ }).click();
    await expect(anchor(page, "motion-speed")).toBeInViewport();
    await summary(page).scrollIntoViewIfNeeded();
    await summary(page).getByRole("button", { name: /^Corners: Round/ }).click();
    await expect(anchor(page, "layout")).toBeInViewport();
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[data-settings-anchor="layout"]') !== null)).toBe(true);

    await choose(page, "Corners", "Default");
    await expect(summary(page)).toContainText("1 setting changed from the default.");
    await choose(page, "Animation speed", "Default");
    await expect(summary(page)).toContainText("Everything is at its default.");
    await expect(chips(page)).toHaveCount(0);
  });

  test("each section carries its description, tied with aria-describedby", async ({ page, baseURL }) => {
    await start(page, baseURL);
    const motion = anchor(page, "motion");
    const id = await motion.getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    await expect(page.locator(`[id="${id}"]`)).toHaveText(/How pages and menus move, and how fast\./);
  });

  test("the summary and the first sections pass axe in both themes", async ({ page, baseURL }) => {
    await start(page, baseURL);
    await choose(page, "Corners", "Round");
    for (const theme of ["light", "dark"]) {
      await page.getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const { violations } = await new AxeBuilder({ page })
        .include('[data-testid="appearance-summary"]')
        .include('[data-settings-anchor="appearance"]')
        .include('[data-settings-anchor="style"]')
        .withTags(WCAG_AA)
        .analyze();
      expect(violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(" ")}`)).toEqual([]);
    }
  });

  test("at 400px wide the summary does not overflow", async ({ page, baseURL }) => {
    await start(page, baseURL, { width: 400, height: 800 });
    await choose(page, "Corners", "Round");
    await choose(page, "Animation speed", "Fast");
    const fits = await summary(page).evaluate((element) => element.scrollWidth <= element.clientWidth);
    expect(fits).toBe(true);
  });
});

// Settings > Preferences appearance: organised sections, a per-row Reset that shows only when a
// row differs from its default, JSON export/import, one "Reset appearance", and the overlay
// transition reaching a real menu. Ponytail: the clipboard is read through Playwright's
// clipboard-read permission (Chromium); the overlay animation is read right after the click, so
// an entrance shorter than ~2 frames could be missed.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ANCHORS = ["appearance", "style", "color", "layout", "motion-page", "motion-overlay", "motion-speed", "accessibility", "appearance-backup", "input-options", "language-time", "desktop-app", "privacy"];
const html = (page) => page.locator("html");
const storedAppearance = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("osionos:appearance") ?? "null"));
const region = (page) => page.getByRole("region", { name: "Settings", exact: true });
const backupStatus = (page) => region(page).locator('[data-settings-anchor="appearance-backup"]').getByRole("status");

async function seed(page, appearance) {
  await page.route("**/*", (route) => (route.request().method() === "GET" ? route.fallback() : route.abort()));
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem("appearance-seeded")) return;
    sessionStorage.setItem("appearance-seeded", "1");
    localStorage.setItem("osionos:theme-mode", "light");
    if (raw !== null) localStorage.setItem("osionos:appearance", raw);
  }, appearance === undefined ? null : JSON.stringify(appearance));
}

async function openSettings(page) {
  await page.getByRole("tab", { name: "Settings", exact: true }).first().click();
  await region(page).waitFor();
}

async function openPreferences(page) {
  await openSettings(page);
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Preferences" }).click();
  await page.getByTestId("motion-controls").waitFor();
}

async function start(page, baseURL, appearance) {
  await seed(page, appearance);
  await openFreshPage(page, baseURL);
  await openPreferences(page);
}

test.describe("appearance settings", () => {
  test("every section anchor is in the page, and search lands on the right one", async ({ page, baseURL }) => {
    await start(page, baseURL);
    for (const anchor of ANCHORS) await expect(region(page).locator(`[data-settings-anchor="${anchor}"]`), anchor).toHaveCount(1);
    const search = page.getByRole("searchbox", { name: "Search settings" });
    for (const [query, anchor] of [["frosted", "style"], ["caret", "color"]]) {
      await search.fill(query);
      await search.press("Enter");
      await expect(region(page).locator(`[data-settings-anchor="${anchor}"]`), query).toBeInViewport();
    }
    await search.fill("export");
    await page.getByRole("search").getByRole("button", { name: /Your appearance/ }).click();
    await expect(region(page).locator('[data-settings-anchor="appearance-backup"]')).toBeInViewport();
  });

  test("a changed row shows its own Reset, and resetting removes the attribute and the button", async ({ page, baseURL }) => {
    await start(page, baseURL);
    const reset = region(page).getByRole("button", { name: "Reset Corners to default" });
    await expect(reset).toHaveCount(0);
    await region(page).getByRole("group", { name: "Corners" }).getByRole("tab", { name: "Round" }).click();
    await expect(html(page)).toHaveAttribute("data-radius", "round");
    await expect(reset).toBeVisible();
    await reset.click();
    await expect(html(page)).not.toHaveAttribute("data-radius", /.*/);
    await expect(reset).toHaveCount(0);
  });

  test("Copy as JSON puts both changed axes and the kind on the clipboard", async ({ page, baseURL, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await start(page, baseURL);
    await region(page).getByRole("group", { name: "Corners" }).getByRole("tab", { name: "Round" }).click();
    await region(page).getByRole("group", { name: "Density" }).getByRole("tab", { name: "Compact" }).click();
    await region(page).getByRole("button", { name: "Copy as JSON" }).click();
    await expect(backupStatus(page)).toHaveText("Appearance copied");
    const exported = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    expect(exported.kind).toBe("osionos-appearance");
    expect(exported.appearance).toEqual({ radius: "round", density: "compact" });
  });

  test("Import JSON applies valid text and rejects junk with an alert", async ({ page, baseURL }) => {
    await start(page, baseURL);
    await region(page).getByRole("button", { name: "Import JSON" }).click();
    const box = region(page).getByLabel("Appearance JSON");
    await box.fill("not json");
    await region(page).getByRole("button", { name: "Apply", exact: true }).click();
    const alert = page.locator('[role="alert"]').filter({ hasText: "not valid JSON" });
    await expect(alert).toBeVisible();
    await expect(html(page)).not.toHaveAttribute("data-surface", /.*/);
    await box.fill('{"kind":"osionos-appearance","version":1,"appearance":{"surface":"glass","pageTransition":"blur"}}');
    await region(page).getByRole("button", { name: "Apply", exact: true }).click();
    await expect(backupStatus(page)).toHaveText("Imported 2 settings");
    await expect(html(page)).toHaveAttribute("data-surface", "glass");
    await expect(html(page)).toHaveAttribute("data-page-transition", "blur");
    await expect(alert).toHaveCount(0);
  });

  test("Reset appearance restores every default after a confirmation", async ({ page, baseURL }) => {
    await start(page, baseURL, { surface: "glass", density: "compact", caretShape: "block", motionSpeed: "fast" });
    await expect(html(page)).toHaveAttribute("data-surface", "glass");
    await region(page).getByRole("button", { name: "Reset appearance" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Reset", exact: true }).click();
    await expect(html(page)).not.toHaveAttribute("data-surface", /.*/);
    const stored = await storedAppearance(page);
    expect(stored.surface).toBe("solid");
    expect(stored.density).toBe("comfortable");
    expect(stored.caretShape).toBe("bar");
    expect(stored.motionSpeed).toBe("default");
    const axes = await page.evaluate(() => Object.keys(document.documentElement.dataset).filter((key) => key !== "theme" && key !== "palette"));
    expect(axes).toEqual([]);
    await expect(region(page).getByText("Everything is at its default.")).toBeVisible();
  });

  for (const [transition, fromOpacity] of [["blur", "0"], ["none", "1"]]) {
    test(`overlay transition "${transition}" reaches a real menu`, async ({ page, baseURL }) => {
      await seed(page, { overlayTransition: transition });
      await openFreshPage(page, baseURL);
      await page.getByText("Getting Started", { exact: true }).first().click({ button: "right" });
      const menu = page.getByRole("menu").first();
      await expect(menu).toBeVisible();
      await expect(menu).toHaveCSS("animation-name", "osio-pop-in");
      const root = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return { filter: style.getPropertyValue("--osio-overlay-from-filter"), opacity: style.getPropertyValue("--osio-overlay-from-opacity") };
      });
      expect(root.opacity.trim()).toBe(fromOpacity);
      if (transition === "blur") expect(root.filter).toContain("blur");
      else expect(root.filter).not.toContain("blur");
    });
  }

  for (const theme of ["light", "dark"]) {
    test(`the Preferences page passes axe in ${theme}`, async ({ page, baseURL }) => {
      await start(page, baseURL);
      await region(page).getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click();
      await expect(html(page)).toHaveAttribute("data-theme", theme);
      const { violations } = await new AxeBuilder({ page }).include('[role="region"][aria-label="Settings"]').withTags(WCAG_AA).analyze();
      expect(violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(" ")}`)).toEqual([]);
    });
  }
});

// Theme gallery in Settings > Preferences: pick by card, keyboard roving, filter, customize/duplicate,
// delete with Undo, import, and axe. Ponytail: the open-editor assertion is the tab strip's
// ".json" title, as themeEditor.spec.mjs does; a theme whose tab title changes would be missed.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const region = (page) => page.getByRole("region", { name: "Settings", exact: true });
const anchor = (page) => region(page).locator('[data-settings-anchor="theme-json"]');
const gallery = (page) => region(page).getByRole("radiogroup", { name: "Theme", exact: true });
const card = (page, name) => gallery(page).getByRole("radio", { name, exact: true });
const library = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("osionos:theme-library") ?? "null")?.state ?? {});
const OWN = { name: "Mine", base: "dark", colors: { "bg-page": "#101820", accent: "#ff0066" } };

async function start(page, baseURL, { mode = "light", themes } = {}) {
  await page.route("**/*", (route) => (route.request().method() === "GET" ? route.fallback() : route.abort()));
  await page.addInitScript(([themeMode, own]) => {
    if (sessionStorage.getItem("gallery-seeded")) return;
    sessionStorage.setItem("gallery-seeded", "1");
    localStorage.setItem("osionos:theme-mode", themeMode);
    if (own) localStorage.setItem("osionos:theme-library", JSON.stringify({ state: { themes: own, activeTheme: null }, version: 0 }));
  }, [mode, themes ?? null]);
  await openFreshPage(page, baseURL);
  await page.getByRole("tab", { name: "Settings", exact: true }).first().click();
  await region(page).waitFor();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Preferences" }).click();
  await gallery(page).waitFor();
}

test.describe("theme gallery", () => {
  test("clicking a shipped card selects it, stores it and restyles the page", async ({ page, baseURL }) => {
    await start(page, baseURL);
    const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--osio-bg-page").trim());
    await card(page, "Harbor Night").click();
    await expect(card(page, "Harbor Night")).toHaveAttribute("aria-checked", "true");
    expect((await library(page)).activeTheme).toBe("Harbor Night");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--osio-bg-page").trim())).not.toBe(before);
  });

  test("arrow keys move focus and selection, End selects the last card", async ({ page, baseURL }) => {
    await start(page, baseURL);
    const cards = gallery(page).getByRole("radio");
    await expect(cards.first()).toHaveAttribute("aria-checked", "true");
    await cards.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(cards.nth(1)).toBeFocused();
    await expect(cards.nth(1)).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("End");
    await expect(cards.last()).toBeFocused();
    await expect(cards.last()).toHaveAttribute("aria-checked", "true");
  });

  test("the Dark filter shows only cards labelled Dark", async ({ page, baseURL }) => {
    await start(page, baseURL);
    await region(page).getByRole("group", { name: "Show", exact: true }).getByRole("tab", { name: "Dark" }).click();
    const cards = gallery(page).getByRole("radio");
    expect(await cards.count()).toBeGreaterThan(0);
    for (const one of await cards.all()) await expect(one.locator('[data-theme-base="Dark"]')).toHaveCount(1);
  });

  test("Customize on a shipped theme saves a copy and opens its editor tab", async ({ page, baseURL }) => {
    await start(page, baseURL);
    await card(page, "Harbor Night").click();
    await anchor(page).getByRole("button", { name: "Customize", exact: true }).click();
    await expect(page.locator('[data-osio-tabstrip] [title$=".json"]')).toHaveCount(1, { timeout: 30_000 });
    const saved = await library(page);
    expect(Object.values(saved.themes).map((doc) => doc.name)).toContain("Harbor Night copy");
    expect(saved.activeTheme).toBe("Harbor Night copy");
  });

  test("Delete shows an Undo toast and Undo brings the theme back, active", async ({ page, baseURL }) => {
    await start(page, baseURL, { themes: { mine: OWN } });
    await card(page, "Mine").click();
    await anchor(page).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(card(page, "Mine")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(card(page, "Mine")).toHaveAttribute("aria-checked", "true");
    expect((await library(page)).activeTheme).toBe("Mine");
  });

  test("Import theme: invalid JSON alerts, a shipped name imports as '<name> 2'", async ({ page, baseURL }) => {
    await start(page, baseURL);
    await anchor(page).getByRole("button", { name: "Import theme", exact: true }).click();
    const box = anchor(page).getByLabel("Theme JSON");
    await box.fill("not json");
    await anchor(page).getByRole("button", { name: "Import", exact: true }).click();
    await expect(anchor(page).getByRole("alert").filter({ hasText: "not valid JSON" })).toBeVisible();
    await box.fill(JSON.stringify({ name: "Harbor Night", base: "dark", colors: { accent: "#ff0066" } }));
    await anchor(page).getByRole("button", { name: "Import", exact: true }).click();
    await expect(card(page, "Harbor Night 2")).toHaveAttribute("aria-checked", "true");
  });

  for (const mode of ["light", "dark"]) {
    test(`the gallery has no WCAG 2.2 AA violations in ${mode}`, async ({ page, baseURL }) => {
      await start(page, baseURL, { mode, themes: { mine: OWN } });
      const results = await new AxeBuilder({ page }).include('[data-settings-anchor="theme-json"]').withTags(WCAG_AA).analyze();
      expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.target}`)).toEqual([]);
    });
  }
});

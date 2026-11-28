// Settings > Preferences > Theme tokens: the reference of every key a theme JSON accepts, with the
// live value of each. Ponytail: the value is compared with getComputedStyle on <html>, so a token a
// theme leaves unset shows the stylesheet default on both sides and a wrong default would go unseen.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const region = (page) => page.getByRole("region", { name: "Settings", exact: true });
const section = (page) => region(page).locator('[data-settings-anchor="theme-tokens"]');
const computed = (page, key) => page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(`--osio-${name}`).trim(), key);

async function start(page, baseURL) {
  await page.route("**/*", (route) => (route.request().method() === "GET" ? route.fallback() : route.abort()));
  await page.addInitScript(() => {
    if (sessionStorage.getItem("tokens-seeded")) return;
    sessionStorage.setItem("tokens-seeded", "1");
    localStorage.setItem("osionos:theme-mode", "light");
  });
  await openFreshPage(page, baseURL);
  await page.getByRole("tab", { name: "Settings", exact: true }).first().click();
  await region(page).waitFor();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Preferences" }).click();
  await page.getByTestId("motion-controls").waitFor();
}

const openColors = (page) => section(page).locator('[data-token-group="colors"] summary').click();

test.describe("theme token reference", () => {
  test("Settings search for tokens lands on the section", async ({ page, baseURL }) => {
    await start(page, baseURL);
    const search = page.getByRole("searchbox", { name: "Search settings" });
    await search.fill("tokens");
    await page.getByRole("search").getByRole("button", { name: /Theme tokens/ }).click();
    await expect(section(page)).toBeInViewport();
  });

  test("filtering by topbar shows the Layout row with its live value", async ({ page, baseURL }) => {
    await start(page, baseURL);
    await section(page).getByLabel("Filter tokens").fill("topbar");
    await expect(section(page).locator("[data-token-group]")).toHaveCount(2);
    await expect(section(page).locator('[data-token-group="fonts"]')).toHaveCount(0);
    await expect(section(page).locator('[data-token-group="layout"]')).toBeVisible();
    const row = section(page).locator('[data-token-key="topbar-h"]');
    await expect(row.locator("[data-token-value]")).toHaveText(await computed(page, "topbar-h"));
  });

  test("a color row follows the theme", async ({ page, baseURL }) => {
    await start(page, baseURL);
    await openColors(page);
    const first = section(page).locator('[data-token-group="colors"] [data-token-key]').first();
    const key = await first.getAttribute("data-token-key");
    await expect(first.locator("[data-token-value]")).toHaveText(await computed(page, key));
    const before = await first.locator("[data-token-value]").innerText();
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const after = await computed(page, key);
    expect(after).not.toBe(before);
    await expect(first.locator("[data-token-value]")).toHaveText(after);
  });

  test("a nonsense filter says nothing matches", async ({ page, baseURL }) => {
    await start(page, baseURL);
    await section(page).getByLabel("Filter tokens").fill("zzqq-nothing");
    await expect(section(page).getByText("No token matches “zzqq-nothing”.")).toBeVisible();
  });

  test("passes axe with Colors open, light and dark", async ({ page, baseURL }) => {
    await start(page, baseURL);
    await openColors(page);
    for (const theme of ["light", "dark"]) {
      await page.getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const { violations } = await new AxeBuilder({ page }).include('[data-settings-anchor="theme-tokens"]').withTags(WCAG_AA).analyze();
      expect(violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(" ")}`)).toEqual([]);
    }
  });

  test("Copy writes a JSON line that parses and announces it; a refused clipboard is announced too (#345 K2)", async ({ page, baseURL }) => {
    // A stub clipboard: the real one needs a permission only Chromium can grant.
    await page.addInitScript(() => {
      window.__copied = [];
      window.__refuseClipboard = false;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: (text) => (window.__refuseClipboard ? Promise.reject(new Error("denied")) : (window.__copied.push(text), Promise.resolve())) },
      });
    });
    await start(page, baseURL);
    await section(page).getByLabel("Filter tokens").fill("font-family-sans");
    const status = section(page).getByRole("status");
    await section(page).getByRole("button", { name: "Copy font-family-sans", exact: true }).click();
    await expect(status).toHaveText("Copied font-family-sans");
    const line = await page.evaluate(() => window.__copied.at(-1));
    expect(JSON.parse(`{${line}}`)["font-family-sans"]).toBe(await computed(page, "font-family-sans"));
    await page.evaluate(() => { window.__refuseClipboard = true; });
    await section(page).getByRole("button", { name: "Copy font-family-sans", exact: true }).click();
    await expect(status).toHaveText("Could not copy font-family-sans");
  });

  test("at 400px wide the section does not overflow", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await start(page, baseURL);
    await section(page).getByLabel("Filter tokens").fill("shadow");
    const { scrollWidth, clientWidth } = await section(page).evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});

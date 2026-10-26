// A custom theme reaches <html> before first paint: index.html writes the
// cached `--osio-*` map (localStorage osionos:theme-vars) and the light/dark it
// pins, the app's boot pass keeps them, ?theme=safe skips them for the visit,
// and a tampered cache is filtered out instead of written.

import { expect, test } from "@playwright/test";

import { createNewWorkspacePage } from "../../browser/core/app.mjs";

const THEME = { v: 1, base: "dark", vars: { "--osio-bg-page": "#123456", "--osio-radius": "3px" } };

/** Stores a light mode and the given first-paint cache before every load. */
async function seed(page, cache) {
  await page.addInitScript((raw) => {
    localStorage.setItem("osionos:theme-mode", "light");
    localStorage.setItem("osionos:theme-vars", raw);
  }, JSON.stringify(cache));
}

const inlineToken = (page, name) => page.evaluate((token) => document.documentElement.style.getPropertyValue(token), name);
const computedToken = (page, name) => page.evaluate((token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim(), name);

test.describe("custom theme at first paint", () => {
  test("the cached theme is on <html> before the app mounts, and the boot pass keeps it", async ({ page, baseURL }) => {
    await seed(page, THEME);
    await page.addInitScript(() => {
      window.__firstThemeWrite = null;
      // <html> does not exist yet when init scripts run, so watch the document.
      new MutationObserver(() => {
        const root = document.documentElement;
        const value = root?.style.getPropertyValue("--osio-bg-page");
        if (window.__firstThemeWrite || !value) return;
        window.__firstThemeWrite = { value, theme: root.dataset.theme, readyState: document.readyState, mounted: Boolean(document.getElementById("root")?.firstChild) };
      }).observe(document, { attributes: true, subtree: true });
    });
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    expect(await page.evaluate(() => window.__firstThemeWrite)).toEqual({ value: "#123456", theme: "dark", readyState: "loading", mounted: false });

    await createNewWorkspacePage(page);
    expect(await computedToken(page, "--osio-bg-page")).toBe("#123456");
    expect(await computedToken(page, "--osio-radius")).toBe("3px");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("?theme=safe shows the built-in look for the visit", async ({ page, baseURL }) => {
    await seed(page, THEME);
    await page.goto(new URL("?theme=safe", baseURL).toString(), { waitUntil: "domcontentloaded" });
    expect(await inlineToken(page, "--osio-bg-page")).toBe("");
    await createNewWorkspacePage(page);
    expect(await inlineToken(page, "--osio-bg-page")).toBe("");
    const palette = await computedToken(page, "--osio-bg-page");
    expect(palette).not.toBe("");
    expect(palette).not.toBe("#123456");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("a cache with a value that could leave its declaration is not written", async ({ page, baseURL }) => {
    // The browser itself would accept the var() value; only the filter keeps it out.
    await seed(page, { v: 1, vars: { "--osio-bg-page": "red;}", "--osio-link": "var(--osio-danger)", "--x": "red" } });
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    for (const name of ["--osio-bg-page", "--osio-link", "--x"]) expect(await inlineToken(page, name)).toBe("");
    await createNewWorkspacePage(page);
    expect(await inlineToken(page, "--osio-bg-page")).toBe("");
    expect(await computedToken(page, "--osio-bg-page")).not.toBe("");
  });
});

// Personal appearance: an accent (preset or free hue), density, corners and
// text size. Each is an attribute on <html> written by theme.ts, mirrored by the
// boot script in index.html so a stored choice is there before first paint, and
// kept under one localStorage key.

import { expect, test } from "@playwright/test";

import { customTokens, presetTokens, withAccent } from "../../../scripts/tokens/accents.mjs";
import { PALETTES } from "../../../scripts/tokens/palettes.mjs";
import { openFreshPage } from "../../browser/core/app.mjs";
import { computed, openStyleguide, section } from "../support/styleguideHelpers.mjs";

const html = (page) => page.locator("html");
const rootToken = (page, name) => page.evaluate((token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim(), name);
const storedAppearance = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("osionos:appearance") ?? "null"));

/** Stores a light theme and, once per tab, the raw appearance value before the app boots. */
async function seed(page, appearance) {
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem("appearance-seeded")) return;
    sessionStorage.setItem("appearance-seeded", "1");
    localStorage.setItem("osionos:theme-mode", "light");
    if (raw !== null) localStorage.setItem("osionos:appearance", raw);
  }, appearance === undefined ? null : typeof appearance === "string" ? appearance : JSON.stringify(appearance));
}

async function openAppearanceSettings(page) {
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await page.getByRole("tab", { name: "Preferences" }).click();
  await page.getByRole("group", { name: "Accent" }).waitFor();
}

test.describe("appearance preferences", () => {
  test("choosing an accent in Settings recolours the app and survives a reload", async ({ page, baseURL }) => {
    await seed(page);
    await openFreshPage(page, baseURL);
    await openAppearanceSettings(page);
    await page.getByRole("button", { name: "Ember", exact: true }).click();
    const ember = presetTokens("ember", "light")["--osio-a-solid"].toLowerCase();
    await expect(html(page)).toHaveAttribute("data-accent", "ember");
    expect((await rootToken(page, "--osio-accent")).toLowerCase()).toBe(ember);
    expect((await storedAppearance(page)).accent).toBe("ember");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(html(page)).toHaveAttribute("data-accent", "ember");
    expect((await rootToken(page, "--osio-accent")).toLowerCase()).toBe(ember);
  });

  test("the default accent writes no attribute", async ({ page, baseURL }) => {
    await seed(page, { accent: "ember" });
    await openFreshPage(page, baseURL);
    await openAppearanceSettings(page);
    await page.getByRole("button", { name: "Cobalt", exact: true }).click();
    await expect(html(page)).not.toHaveAttribute("data-accent", /.*/);
    expect((await rootToken(page, "--osio-accent")).toLowerCase()).toBe(withAccent(PALETTES[0], "light", {})["--osio-accent"].toLowerCase());
  });

  test("a stored accent is on <html> before the app mounts, so there is no flash", async ({ page, baseURL }) => {
    await seed(page, { accent: "ember", density: "compact", radius: "sharp", uiScale: "large" });
    await page.addInitScript(() => {
      window.__firstAppearance = null;
      // <html> does not exist yet when init scripts run, so watch the document.
      new MutationObserver(() => {
        const { accent, density, radius, uiScale } = document.documentElement.dataset;
        if (window.__firstAppearance || !accent) return;
        window.__firstAppearance = { accent, density, radius, uiScale, readyState: document.readyState, mounted: Boolean(document.getElementById("root")?.firstChild) };
      }).observe(document, { attributes: true, subtree: true });
    });
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    const first = await page.evaluate(() => window.__firstAppearance);
    expect(first).toEqual({ accent: "ember", density: "compact", radius: "sharp", uiScale: "large", readyState: "loading", mounted: false });
    // CSS arrives with the app's own module, so the computed value is read once it has.
    await page.getByRole("textbox", { name: "Page title" }).waitFor({ state: "attached" }).catch(() => undefined);
    expect((await rootToken(page, "--osio-accent")).toLowerCase()).toBe(presetTokens("ember", "light")["--osio-a-solid"].toLowerCase());
  });

  test("a corrupt stored value is ignored", async ({ page, baseURL }) => {
    await seed(page, '{"accent":"chartreuse","hue":999,"density":"dense"');
    await openFreshPage(page, baseURL);
    for (const attribute of ["data-accent", "data-density", "data-radius", "data-ui-scale"]) {
      await expect(html(page)).not.toHaveAttribute(attribute, /.*/);
    }
  });

  test("compact density makes a medium button 28px and takes the frame gap to 0", async ({ page, baseURL }) => {
    await seed(page, { density: "compact" });
    await openStyleguide(page, baseURL);
    const button = section(page, "Primitives").getByRole("button", { name: "Default", exact: true });
    expect(await computed(button, "height")).toBe("28px");
    expect(await rootToken(page, "--osio-frame-gap")).toBe("0px");
  });

  test("comfortable density keeps a medium button at 32px", async ({ page, baseURL }) => {
    await seed(page);
    await openStyleguide(page, baseURL);
    const button = section(page, "Primitives").getByRole("button", { name: "Default", exact: true });
    expect(await computed(button, "height")).toBe("32px");
  });

  test("sharp corners halve the pane radius", async ({ page, baseURL }) => {
    await seed(page, { radius: "sharp" });
    await openFreshPage(page, baseURL);
    const pane = page.locator("[data-osio-pane]").first();
    expect(await computed(pane, "border-top-left-radius")).toBe("6px");
  });

  test("round corners widen the pane radius", async ({ page, baseURL }) => {
    await seed(page, { radius: "round" });
    await openFreshPage(page, baseURL);
    const pane = page.locator("[data-osio-pane]").first();
    const radius = Number.parseFloat(await computed(pane, "border-top-left-radius"));
    expect(radius).toBeCloseTo(15.96, 1);
  });

  test("the segmented controls apply instantly, persist, and clear at their defaults", async ({ page, baseURL }) => {
    await seed(page);
    await openFreshPage(page, baseURL);
    await openAppearanceSettings(page);
    const tab = (group, name) => page.getByRole("group", { name: group, exact: true }).getByRole("tab", { name, exact: true });
    await tab("Density", "Compact").click();
    await tab("Corners", "Sharp").click();
    await tab("Text size", "Large").click();
    await expect(html(page)).toHaveAttribute("data-density", "compact");
    await expect(html(page)).toHaveAttribute("data-radius", "sharp");
    await expect(html(page)).toHaveAttribute("data-ui-scale", "large");
    expect(await computed(page.locator("body"), "font-size")).toBe("15px");
    expect(await storedAppearance(page)).toMatchObject({ density: "compact", radius: "sharp", uiScale: "large" });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(html(page)).toHaveAttribute("data-density", "compact");
    await openAppearanceSettings(page);
    await tab("Density", "Comfortable").click();
    await tab("Corners", "Default").click();
    await tab("Text size", "Default").click();
    for (const attribute of ["data-density", "data-radius", "data-ui-scale"]) {
      await expect(html(page)).not.toHaveAttribute(attribute, /.*/);
    }
    expect(await computed(page.locator("body"), "font-size")).toBe("14px");
  });

  test("a custom hue takes its accent from the slider, by keyboard too", async ({ page, baseURL }) => {
    await seed(page, { accent: "custom", hue: 140 });
    await openFreshPage(page, baseURL);
    expect(await rootToken(page, "--osio-accent")).toMatch(/^oklch\(/);
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--osio-accent-hue"))).toBe("140");

    await openAppearanceSettings(page);
    const slider = page.getByRole("slider", { name: "Accent hue" });
    await expect(slider).toHaveValue("140");
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveValue("141");
    await expect(html(page)).toHaveCSS("--osio-accent-hue", "141");
    expect((await storedAppearance(page)).hue).toBe(141);
  });

  test("the Monaco theme receives a #RRGGBB accent for a custom hue", async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      localStorage.setItem("osio.ide", "1");
      localStorage.setItem("osionos:theme-mode", "light");
      localStorage.setItem("osionos:appearance", JSON.stringify({ accent: "custom", hue: 140 }));
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /IDE Workspace/i }).click();
    const shell = page.locator("[data-osio-ide-shell]");
    await shell.waitFor();
    await shell.getByRole("button", { name: "New file" }).click();
    const name = shell.locator('input[placeholder="file name"]');
    await name.fill("hello.py");
    await name.press("Enter");
    await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 });
    // Monaco writes its theme as CSS rules; the cursor colour is the accent.
    const cursor = await page.evaluate(() => {
      const rules = [...document.querySelectorAll("style.monaco-colors")].map((style) => style.textContent ?? "").join("\n");
      return /\.cursor\s*\{[^}]*?(#[0-9a-fA-F]{6})/.exec(rules)?.[1] ?? null;
    });
    expect(cursor).toMatch(/^#[0-9A-F]{6}$/i);
    const want = customTokens("light", 140)["--osio-a-solid"];
    const channel = (hex, at) => Number.parseInt(hex.slice(at, at + 2), 16);
    for (const at of [1, 3, 5]) expect(Math.abs(channel(cursor, at) - channel(want, at))).toBeLessThanOrEqual(3);
  });
});

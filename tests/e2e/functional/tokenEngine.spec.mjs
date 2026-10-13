// What the browser ends up with, not what the generator printed. The generated
// stylesheet has to be bundled, has to be the only definition of the default
// palette, has to lose to the seven palettes that are still hand-written, and
// has to hand script readers (Monaco, the graph engine) a literal colour.

import { expect, test } from "@playwright/test";

import { resolveTokens } from "../../../scripts/tokens/aliases.mjs";
import { MODES, PALETTES } from "../../../scripts/tokens/palettes.mjs";
import { modeTokens } from "../../../scripts/tokens/ramps.mjs";

const [defaultPalette] = PALETTES;
const generated = (mode) => resolveTokens(modeTokens(defaultPalette, mode));

async function openStyleguide(page, baseURL, { mode, palette = defaultPalette.id }) {
  await page.addInitScript(([storedMode, storedPalette]) => {
    localStorage.setItem("osionos:theme-mode", storedMode);
    localStorage.setItem("osionos:palette", storedPalette);
  }, [mode, palette]);
  await page.goto(`${baseURL}/__styleguide`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("styleguide").waitFor();
}

/** The computed value of each named custom property on the element `selector` matches. */
const computedTokens = (page, names, selector = "html") =>
  page.evaluate(([tokenNames, target]) => {
    const style = getComputedStyle(document.querySelector(target));
    return Object.fromEntries(tokenNames.map((name) => [name, style.getPropertyValue(name).trim()]));
  }, [names, selector]);

const paletteIds = (page) =>
  page.getByLabel("Palette", { exact: true }).evaluate((select) => [...select.options].map((option) => option.value));

test.describe("token engine", () => {
  for (const mode of MODES) {
    test(`${mode}: every generated token computes to the colour its seeds produce`, async ({ page, baseURL }) => {
      await openStyleguide(page, baseURL, { mode });
      const expected = generated(mode);
      expect(await computedTokens(page, Object.keys(expected))).toEqual(expected);
    });
  }

  test("an element painted with the accent is cobalt", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL, { mode: "light" });
    const sample = page.getByRole("region", { name: "Accent", exact: true }).locator('[data-token="--osio-accent"]');
    await expect(sample).toHaveCSS("background-color", "rgb(31, 91, 196)");
  });

  test("a subtree in the other mode gets that mode's whole palette", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL, { mode: "light" });
    await page.evaluate(() => {
      const island = document.createElement("div");
      island.id = "dark-island";
      island.dataset.theme = "dark";
      document.body.append(island);
    });
    const expected = generated("dark");
    expect(await computedTokens(page, Object.keys(expected), "#dark-island")).toEqual(expected);
  });

  test("the hand-written palettes still override the default, and their derived colours follow them", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL, { mode: "light" });
    const others = (await paletteIds(page)).filter((id) => id !== defaultPalette.id);
    expect(others.length).toBeGreaterThan(0);
    const names = [
      "--osio-bg-page", "--osio-bg-canvas", "--osio-accent", "--osio-accent-text", "--osio-link",
      "--osio-border-default", "--osio-graph-card-border", "--osio-fg-muted", "--osio-graph-ink-muted",
    ];
    for (const palette of others) {
      for (const mode of MODES) {
        await page.evaluate(([nextPalette, nextMode]) => {
          document.documentElement.dataset.palette = nextPalette;
          document.documentElement.dataset.theme = nextMode;
        }, [palette, mode]);
        const tokens = await computedTokens(page, names);
        const label = `${palette}/${mode}`;
        expect.soft(tokens["--osio-accent"], `${label} keeps its own accent`).not.toBe(generated(mode)["--osio-accent"]);
        expect.soft(tokens["--osio-bg-canvas"], `${label} canvas`).toBe(tokens["--osio-bg-page"]);
        expect.soft(tokens["--osio-link"], `${label} link`).toBe(tokens["--osio-accent-text"]);
        expect.soft(tokens["--osio-graph-card-border"], `${label} graph card border`).toBe(tokens["--osio-border-default"]);
        expect.soft(tokens["--osio-graph-ink-muted"], `${label} graph muted ink`).toBe(tokens["--osio-fg-muted"]);
      }
    }
  });
});

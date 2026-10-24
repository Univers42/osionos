// Palettes are told apart in the browser, not only in the generator: the colours
// the graph engine and the shadows read come from the palette that is on, never
// from the default's browns (Nord's graph used to be warm). That every token is
// defined by every palette is pinned statically (tokens-palettes-output.test.ts)
// and its values by tokenEngine.spec.mjs: a palette that left a token out would
// inherit the default's from :root and never compute to nothing, so it is not
// asserted here.

import { expect, test } from "@playwright/test";

import { MODES, PALETTES } from "../../../scripts/tokens/palettes.mjs";

const [defaultPalette] = PALETTES;

// What differs between two palettes' graphs, shadows and callouts if each is its own.
const OWN_TOKENS = ["--osio-graph-edge-note", "--osio-shadow-rgb", "--osio-block-tint-blue-bg", "--osio-graph-edge", "--osio-graph-edge-tag", "--osio-graph-edge-hier"];

async function openStyleguide(page, baseURL) {
  await page.addInitScript(() => {
    localStorage.setItem("osionos:theme-mode", "light");
    localStorage.setItem("osionos:palette", "warm");
  });
  await page.goto(`${baseURL}/__styleguide`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("styleguide").waitFor();
}

const paletteIds = (page) =>
  page.getByLabel("Palette", { exact: true }).evaluate((select) => [...select.options].map((option) => option.value));

/** Switches the page to `palette`/`mode` and returns the computed value of each named property on <html>. */
async function tokensOf(page, palette, mode, names) {
  return page.evaluate(([nextPalette, nextMode, tokenNames]) => {
    document.documentElement.dataset.palette = nextPalette;
    document.documentElement.dataset.theme = nextMode;
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(tokenNames.map((name) => [name, style.getPropertyValue(name).trim()]));
  }, [palette, mode, names]);
}

test.describe("palette completeness", () => {
  test("the picker offers every palette the generator knows, Ember included", async ({ page, baseURL }) => {
    await openStyleguide(page, baseURL);
    expect(await paletteIds(page)).toEqual(PALETTES.map((palette) => palette.id));
  });

  for (const mode of MODES) {
    test(`${mode}: Nord's graph, shadows and callouts are not the default's`, async ({ page, baseURL }) => {
      await openStyleguide(page, baseURL);
      const warm = await tokensOf(page, defaultPalette.id, mode, OWN_TOKENS);
      const nord = await tokensOf(page, "nord", mode, OWN_TOKENS);
      for (const name of OWN_TOKENS) {
        if (name === "--osio-shadow-rgb" && mode === "dark") continue; // black on a dark page, in every palette
        expect.soft(nord[name], `${mode} ${name}`).not.toBe(warm[name]);
      }
    });

    test(`${mode}: every palette selects in the graph with its own accent`, async ({ page, baseURL }) => {
      await openStyleguide(page, baseURL);
      for (const id of await paletteIds(page)) {
        const tokens = await tokensOf(page, id, mode, ["--osio-graph-select", "--osio-accent"]);
        expect.soft(tokens["--osio-graph-select"], `${id}/${mode} graph select`).toBe(tokens["--osio-accent"]);
      }
    });

    test(`${mode}: a shadow is cast in the palette's own tint`, async ({ page, baseURL }) => {
      await openStyleguide(page, baseURL);
      for (const id of await paletteIds(page)) {
        const tokens = await tokensOf(page, id, mode, ["--osio-shadow-rgb", "--osio-e3", "--osio-shadow-cell"]);
        const channels = tokens["--osio-shadow-rgb"].split(" ");
        for (const name of ["--osio-e3", "--osio-shadow-cell"]) {
          expect.soft(tokens[name].replaceAll(/\s+/g, " "), `${id}/${mode} ${name}`).toContain(`rgb(${channels.join(" ")} /`);
        }
      }
    });
  }
});

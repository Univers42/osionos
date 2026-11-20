// The slash "Sections" group places a library section where "/" was typed, in one
// undo step; and the section/shell catalogue is code, never a cached page (ADR 0064
// PS18: no page-cache write or cached entry carries a shell while the catalogue loads).

/* global localStorage, Storage */

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage, slashCommandEntry, slashMenu } from "../../browser/core/app.mjs";

const HERO_TITLE = "Say what you do in one line";

// Sections ship with the layout rendering (ADR 0064 PS10): on unless a test says off.
const withLayoutModes = (page, on = true) =>
  page.addInitScript((value) => (value ? localStorage.setItem("osio.layout.modes", "1") : localStorage.removeItem("osio.layout.modes")), on);

test("with osio.layout.modes off the slash menu offers no section", async ({ page, baseURL }) => {
  await withLayoutModes(page, false);
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.pressSequentially("/hero");
  await expect(slashCommandEntry(page, "Hero")).toHaveCount(0);
});

test("slash Sections inserts the hero in place of the trigger; one undo takes it out", async ({ page, baseURL }) => {
  await withLayoutModes(page);
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.pressSequentially("/hero");
  await expect(slashCommandEntry(page, "Hero")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(slashMenu(page)).toHaveCount(0);
  const body = page.locator(".osionos-page-body");
  await expect(body.getByText(HERO_TITLE)).toBeVisible();
  await expect(body.locator('[data-block-type="column_list"], .osio-columns-row').first()).toBeVisible();
  await expect(body.getByText("/hero")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(body.getByText(HERO_TITLE)).toHaveCount(0);
});

test("the catalogue loads without touching the page cache (PS18)", async ({ page, baseURL }) => {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /New page/i }).first().or(page.getByRole("tab", { name: "Explorer" })).first().waitFor();
  // Boot keeps syncing the cache after the first paint (CI 44541278487 grew it by
  // 5,090 chars after two equal reads), so record the catalogue window's own writes
  // instead of comparing totals.
  const loaded = await page.evaluate(async () => {
    const writes = [];
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function record(key, value) {
      if (String(key).startsWith("osio:pages:")) writes.push(String(value));
      return setItem.call(this, key, value);
    };
    try {
      const shells = await import("/src/data/templates/catalogue/shells/shellIndex.ts");
      const catalogue = await import("/src/data/templates/catalogue/index.ts");
      const sections = await import("/src/data/templates/sections/sectionIndex.ts");
      const built = await Promise.all([
        ...shells.SHELLS.map(async (shell) => (await catalogue.loadTemplate(`tpl:${shell.id}`))?.content),
        ...sections.SECTIONS.map((section) => sections.buildSection(section.id)),
      ]);
      const titles = new Set(shells.SHELLS.map((shell) => shell.title));
      const cached = [...writes, ...Object.keys(localStorage).filter((key) => key.startsWith("osio:pages:")).map((key) => localStorage.getItem(key) ?? "[]")]
        .flatMap((value) => JSON.parse(value));
      return { built: built.filter((blocks) => blocks?.length).length, cachedShells: cached.filter((entry) => titles.has(entry?.title)).length };
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
  expect(loaded).toEqual({ built: 57, cachedShells: 0 });
});

// The slash "Sections" group places a library section where "/" was typed, in one
// undo step; and the section/shell catalogue is code, never a cached page (ADR 0064
// PS18: the page cache's storedLength is the same before and after the catalogue loads).

/* global localStorage */

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage, slashCommandEntry, slashMenu } from "../../browser/core/app.mjs";

const HERO_TITLE = "Say what you do in one line";

test("slash Sections inserts the hero in place of the trigger; one undo takes it out", async ({ page, baseURL }) => {
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
  const cacheLength = () => page.evaluate(async () => {
    const { storedLength } = await import("/src/widgets/database-view/model/knownDatabaseJournal.ts");
    return Object.keys(localStorage).filter((key) => key.startsWith("osio:pages:"))
      .reduce((sum, key) => sum + storedLength(localStorage.getItem(key) ?? ""), 0);
  });
  // The boot writes the seed into the cache: measure once two reads agree.
  let before = -1;
  await expect.poll(async () => {
    const now = await cacheLength();
    const settled = now > 0 && now === before;
    before = now;
    return settled;
  }, { intervals: [300] }).toBe(true);
  const loaded = await page.evaluate(async () => {
    const shells = await import("/src/data/templates/shells/shellIndex.ts");
    const sections = await import("/src/data/templates/sections/sectionIndex.ts");
    const built = await Promise.all([
      ...shells.SHELLS.map((shell) => shells.loadShell(shell.id)),
      ...sections.SECTIONS.map((section) => sections.buildSection(section.id)),
    ]);
    const titles = new Set(shells.SHELLS.map((shell) => shell.title));
    const cached = Object.keys(localStorage).filter((key) => key.startsWith("osio:pages:"))
      .flatMap((key) => JSON.parse(localStorage.getItem(key) ?? "[]"));
    return { built: built.filter((blocks) => blocks?.length).length, cachedShells: cached.filter((entry) => titles.has(entry.title)).length };
  });
  expect(loaded).toEqual({ built: 32, cachedShells: 0 });
  expect(await cacheLength()).toBe(before);
});

/* ************************************************************************** */
/*  automationShortcuts.mjs — keyboard-shortcut manager (osio.automations)    */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import { createParagraphs, getEditors, openFreshPage, visibleBlockTexts } from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

/** Turn a feature flag on before the app boots (localStorage is read on init). */
async function enableFlags(page, ...flags) {
  await page.addInitScript((names) => {
    for (const name of names) {
      try {
        localStorage.setItem(name, "1");
      } catch {
        /* storage unavailable — the URL-param path still covers manual runs */
      }
    }
  }, flags);
}

async function openShortcutManager(page) {
  const search = page.getByRole("combobox", { name: "Search pages or run a command" });
  await search.click();
  await search.fill(">shortcut");
  await page.getByRole("option").filter({ hasText: /Keyboard shortcuts/i }).first().click();
}

export const automationShortcutsScenarios = [
  defineScenario(
    "9. Automations",
    "Shortcut manager",
    ">shortcut opens the editable shortcut table with the seeded bindings",
    async ({ page, appUrl }) => {
      await enableFlags(page, "osio.automations");
      await openFreshPage(page, appUrl);
      await openShortcutManager(page);

      await expect(page.getByRole("heading", { name: "Keyboard shortcuts" }).first()).toBeVisible();
      // The toolbar (add / export / import / reset).
      await expect(page.getByRole("button", { name: /Export/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Import/ })).toBeVisible();
      // One on/off toggle per seeded shortcut row → the whole table rendered.
      const rowToggles = page.getByRole("button", { name: /^(Enabled|Disabled)$/ });
      await expect(rowToggles.first()).toBeVisible();
      expect(await rowToggles.count()).toBeGreaterThanOrEqual(24);
    },
  ),
  defineScenario(
    "9. Automations",
    "Shortcut manager",
    "toggling a shortcut off persists to the exportable config store",
    async ({ page, appUrl }) => {
      await enableFlags(page, "osio.automations");
      await openFreshPage(page, appUrl);
      await openShortcutManager(page);

      // The first row is Undo; its toggle starts enabled. Turn it off.
      const undoToggle = page.getByRole("button", { name: /^(Enabled|Disabled)$/ }).first();
      await expect(undoToggle).toHaveAccessibleName("Enabled");
      await undoToggle.click();
      await expect(undoToggle).toHaveAccessibleName("Disabled");

      // The change is written to the persisted (export/import) settings store.
      const persisted = await page.evaluate(() => localStorage.getItem("osionos:settings:automations"));
      expect(persisted ?? "").toContain("\"enabled\":false");
    },
  ),
  defineScenario(
    "9. Automations",
    "Dispatch",
    "mod+k fires the search command (dispatcher active; no editor handle needed)",
    async ({ page, appUrl }) => {
      await enableFlags(page, "osio.automations");
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["focus me"]);
      await getEditors(page).first().click();
      await page.keyboard.press("Control+k");
      await expect(page.getByRole("combobox", { name: "Search pages or run a command" })).toBeFocused();
    },
  ),
  defineScenario(
    "9. Automations",
    "Dispatch",
    "mod+alt+3 turns the focused block into a heading_3",
    async ({ page, appUrl }) => {
      await enableFlags(page, "osio.automations");
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["turn me into a heading"]);
      await getEditors(page).first().click();
      await page.keyboard.press("Control+Alt+3");
      // The transformed block wrapper (article[data-testid=draggable-block]) is now a heading_3.
      await expect(page.locator('article[data-block-type="heading_3"]')).toBeVisible();
    },
  ),
  defineScenario(
    "9. Automations",
    "Dispatch",
    "mod+z undoes through the dispatcher (legacy undo is disabled while on)",
    async ({ page, appUrl }) => {
      await enableFlags(page, "osio.automations");
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["undo target"]);
      await getEditors(page).first().click();
      await page.keyboard.press("Control+Alt+3");
      await expect(page.locator('article[data-block-type="heading_3"]')).toBeVisible();
      await page.keyboard.press("Control+z");
      await expect(page.locator('article[data-block-type="heading_3"]')).toHaveCount(0);
    },
  ),
  defineScenario(
    "9. Automations",
    "Safety",
    "with the dispatcher live, ordinary typing is never intercepted",
    async ({ page, appUrl }) => {
      await enableFlags(page, "osio.automations", "osio.blockselect");
      await openFreshPage(page, appUrl);

      // createParagraphs types via the real keyboard; the document-level dispatcher
      // is mounted and active, so this proves it does not hijack printable keys.
      await createParagraphs(page, ["typing stays intact"]);
      await expect(getEditors(page).first()).toContainText("typing stays intact");
      expect(await visibleBlockTexts(page)).toContain("typing stays intact");
    },
  ),
];

import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  clearAndType,
  createBlockViaSlash,
  createParagraphs,
  editorHasFocus,
  getEditors,
  openFreshPage,
  pressEnter,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

export const focusManagementScenarios = [
  defineScenario(
    "28. Focus management",
    "Enter transitions",
    "after Enter on a heading the focus moves into the new paragraph below",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const heading = await activateFirstEditor(page);
      await clearAndType(heading, "# ");
      await page.keyboard.type("Heading");
      await pressEnter(heading);
      await expect.poll(async () => editorHasFocus(getEditors(page).nth(1))).toBe(true);
    },
  ),
  defineScenario(
    "28. Focus management",
    "Delete transitions",
    "after deleting the first empty root block the focus moves to the next logical block",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Delete me", "Keep me"]);
      const first = getEditors(page).first();
      await clearAndType(first, "");
      await first.press("Delete");
      await expect(getEditors(page)).toHaveCount(1);
      await expect.poll(async () => editorHasFocus(getEditors(page).first())).toBe(true);
    },
  ),
  defineScenario(
    "28. Focus management",
    "Container transitions",
    "pressing Enter on an empty toggle summary moves focus into the newly created child",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      await getEditors(page).first().click();
      await page.keyboard.press("Enter");
      await expect(getEditors(page)).toHaveCount(2);
      await expect.poll(async () => editorHasFocus(getEditors(page).nth(1))).toBe(true);
    },
  ),
];

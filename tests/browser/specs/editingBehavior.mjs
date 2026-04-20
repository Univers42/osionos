import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  clearAndType,
  createBlockViaSlash,
  createDivider,
  createParagraphs,
  editorHasFocus,
  editorLeft,
  getEditors,
  openFreshPage,
  pressEnter,
  pressTab,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

function todoCheckboxes(page) {
  return page.locator("button.w-4.h-4");
}

export const editingBehaviorScenarios = [
  defineScenario(
    "3. Enter Key Behavior",
    "Standard blocks",
    "pressing Enter in a paragraph creates a new paragraph below and moves focus to it",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "Paragraph");
      await pressEnter(editor);
      const second = getEditors(page).nth(1);
      await second.waitFor();
      expect(await editorHasFocus(second)).toBe(true);
      await expect(second).toHaveText("");
    },
  ),
  defineScenario(
    "3. Enter Key Behavior",
    "Standard blocks",
    "pressing Enter in a heading creates a normal paragraph below",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "# ");
      await page.keyboard.type("Heading");
      await pressEnter(editor);
      const second = getEditors(page).nth(1);
      const fontSize = await second.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).fontSize),
      );
      expect(fontSize).toBeLessThan(20);
      expect(await editorHasFocus(second)).toBe(true);
    },
  ),
  defineScenario(
    "3. Enter Key Behavior",
    "Standard blocks",
    "pressing Enter inside a code block inserts a newline instead of creating another block",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "code", "Code");
      const textarea = page.locator("textarea");
      await textarea.fill("const a = 1;");
      await textarea.press("End");
      await textarea.press("Enter");
      await textarea.type("const b = 2;");
      await expect(textarea).toHaveValue("const a = 1;\nconst b = 2;");
      await expect(page.locator("textarea")).toHaveCount(1);
    },
  ),
  defineScenario(
    "3. Enter Key Behavior",
    "List continuation",
    "pressing Enter in a bulleted list item creates a new bullet below",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "- ");
      await page.keyboard.type("Bullet");
      await pressEnter(editor);
      await expect(getEditors(page)).toHaveCount(2);
      await expect(page.locator(".rounded-full")).toHaveCount(2);
    },
  ),
  defineScenario(
    "3. Enter Key Behavior",
    "List continuation",
    "pressing Enter in a numbered list item creates the next number",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "1. ");
      await page.keyboard.type("First");
      await pressEnter(editor);
      await expect(getEditors(page)).toHaveCount(2);
      await expect(page.locator("text=2.").first()).toBeVisible();
    },
  ),
  defineScenario(
    "3. Enter Key Behavior",
    "List continuation",
    "pressing Enter in a to-do item creates a new unchecked to-do below",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "[] ");
      await page.keyboard.type("Task");
      await pressEnter(editor);
      await expect(getEditors(page)).toHaveCount(2);
      await expect(todoCheckboxes(page)).toHaveCount(2);
    },
  ),
  defineScenario(
    "3. Enter Key Behavior",
    "List continuation",
    "pressing Enter on an empty bulleted list item converts it into a paragraph",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "- ");
      await page.keyboard.type("Bullet");
      await pressEnter(editor);
      const emptyItem = getEditors(page).nth(1);
      await pressEnter(emptyItem);
      await expect(page.locator(".rounded-full")).toHaveCount(1);
      await expect(getEditors(page)).toHaveCount(2);
    },
  ),
  defineScenario(
    "3. Enter Key Behavior",
    "List continuation",
    "pressing Enter on an empty to-do item converts it into a paragraph",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "[] ");
      await page.keyboard.type("Task");
      await pressEnter(editor);
      const emptyItem = getEditors(page).nth(1);
      await pressEnter(emptyItem);
      await expect(todoCheckboxes(page)).toHaveCount(1);
      await expect(getEditors(page)).toHaveCount(2);
    },
  ),
  defineScenario(
    "3. Enter Key Behavior",
    "Container blocks",
    "pressing Enter in a callout creates a child paragraph inside the callout",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "callout", "Callout");
      const callout = getEditors(page).first();
      await clearAndType(callout, "Callout");
      const before = await editorLeft(callout);
      await pressEnter(callout);
      const child = getEditors(page).nth(1);
      expect(await editorLeft(child)).toBeGreaterThan(before + 8);
      expect(await editorHasFocus(child)).toBe(true);
    },
  ),
  defineScenario(
    "3. Enter Key Behavior",
    "Container blocks",
    "pressing Enter in a quote creates a child paragraph inside the quote container",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "quote", "Quote");
      const quote = getEditors(page).first();
      await clearAndType(quote, "Quote");
      const before = await editorLeft(quote);
      await pressEnter(quote);
      const child = getEditors(page).nth(1);
      expect(await editorLeft(child)).toBeGreaterThan(before + 8);
      expect(await editorHasFocus(child)).toBe(true);
    },
  ),
  defineScenario(
    "3. Enter Key Behavior",
    "Container blocks",
    "pressing Enter in a toggle summary expands it and focuses the first child",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      const summary = getEditors(page).first();
      await clearAndType(summary, "Toggle");
      const before = await editorLeft(summary);
      await pressEnter(summary);
      const child = getEditors(page).nth(1);
      expect(await editorLeft(child)).toBeGreaterThan(before + 8);
      expect(await editorHasFocus(child)).toBe(true);
    },
  ),
  defineScenario(
    "4. Backspace / Delete Behavior",
    "Empty block deletion",
    "Backspace on an empty root paragraph deletes it and focuses the previous block",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Keep me", "Delete me"]);
      const second = getEditors(page).nth(1);
      await clearAndType(second, "");
      await second.press("Backspace");
      await expect(getEditors(page)).toHaveCount(1);
      expect(await editorHasFocus(getEditors(page).first())).toBe(true);
    },
  ),
  defineScenario(
    "4. Backspace / Delete Behavior",
    "Empty block deletion",
    "Backspace on an empty heading converts it into a paragraph instead of deleting it",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "# ");
      await page.keyboard.type("Heading");
      await clearAndType(editor, "");
      await editor.press("Backspace");
      const fontSize = await editor.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).fontSize),
      );
      await expect(getEditors(page)).toHaveCount(1);
      expect(fontSize).toBeLessThan(20);
    },
  ),
  defineScenario(
    "4. Backspace / Delete Behavior",
    "Empty block deletion",
    "Backspace on an empty indented paragraph outdents it instead of deleting it",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Parent", "Child"]);
      const child = getEditors(page).nth(1);
      await pressTab(child);
      const indentedLeft = await editorLeft(child);
      await clearAndType(child, "");
      await child.press("Backspace");
      expect(await editorLeft(child)).toBeLessThan(indentedLeft - 8);
      await expect(getEditors(page)).toHaveCount(2);
    },
  ),
  defineScenario(
    "4. Backspace / Delete Behavior",
    "Divider deletion",
    "Delete on a focused divider removes it from the page",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createDivider(page);
      await page.getByRole("button", { name: /Divider block/i }).click();
      await page.keyboard.press("Delete");
      await expect(page.getByRole("button", { name: /Divider block/i })).toHaveCount(0);
    },
  ),
];

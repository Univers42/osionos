import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  editorText,
  openFreshPage,
  openSlashMenuFromEditor,
  selectSlashMenuEntry,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

async function expectSlashMenuOpen(page) {
  await page
    .locator("button:visible", { hasText: /Heading 1/i })
    .first()
    .waitFor();
}

export const blockCreationScenarios = [
  defineScenario(
    "1. Block Creation & Type Selection",
    "Slash menu",
    "typing / in an empty paragraph opens the slash menu",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await openSlashMenuFromEditor(editor, "/");
      await expectSlashMenuOpen(page);
    },
  ),
  defineScenario(
    "1. Block Creation & Type Selection",
    "Slash menu",
    "typing /hea filters the slash menu down to heading options",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await openSlashMenuFromEditor(editor, "/hea");
      await page.locator("button:visible", { hasText: /Heading 1/i }).first().waitFor();
      await expect(page.getByRole("button", { name: /^Quote$/i })).toHaveCount(0);
    },
  ),
  defineScenario(
    "1. Block Creation & Type Selection",
    "Slash menu",
    "clicking Bulleted List converts the current block and cleans the slash text",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await openSlashMenuFromEditor(editor, "/");
      await selectSlashMenuEntry(page, "^Bulleted List$");
      await page.locator(".rounded-full").first().waitFor();
      await expect(editor).toHaveText("");
    },
  ),
  defineScenario(
    "1. Block Creation & Type Selection",
    "Slash menu",
    "pressing Escape closes the slash menu and keeps the typed slash text",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await openSlashMenuFromEditor(editor, "/");
      await expectSlashMenuOpen(page);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: /Heading 1/i })).toHaveCount(0);
      expect(await editorText(editor)).toBe("/");
    },
  ),
  defineScenario(
    "1. Block Creation & Type Selection",
    "Markdown shortcuts",
    "typing # and a space turns the paragraph into a heading",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await openSlashMenuFromEditor(editor, "# ");
      await page.keyboard.type("Heading");
      const fontSize = await editor.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).fontSize),
      );
      expect(fontSize).toBeGreaterThan(20);
      await expect(editor).toHaveText("Heading");
    },
  ),
  defineScenario(
    "1. Block Creation & Type Selection",
    "Markdown shortcuts",
    "typing - and a space turns the paragraph into a bulleted list item",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await openSlashMenuFromEditor(editor, "- ");
      await page.keyboard.type("Bullet item");
      await page.locator(".rounded-full").first().waitFor();
      expect(await editorText(editor)).not.toBe("- Bullet item");
    },
  ),
  defineScenario(
    "1. Block Creation & Type Selection",
    "Markdown shortcuts",
    "typing 1. and a space turns the paragraph into a numbered list item",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await openSlashMenuFromEditor(editor, "1. ");
      await page.keyboard.type("Numbered item");
      await expect(page.locator("text=1.").first()).toBeVisible();
      expect(await editorText(editor)).not.toBe("1. Numbered item");
    },
  ),
  defineScenario(
    "1. Block Creation & Type Selection",
    "Markdown shortcuts",
    "typing a fenced code marker turns the paragraph into a code block",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await openSlashMenuFromEditor(editor, "```typescript ");
      await expect(page.locator("textarea")).toHaveCount(1);
    },
  ),
];

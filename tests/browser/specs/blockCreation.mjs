/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockCreation.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/20 21:29:38 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/20 21:29:39 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

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
    "pressing Enter on /quote converts the block without leaving extra slash text behind",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await openSlashMenuFromEditor(editor, "/quote");
      await page.keyboard.press("Enter");
      const fontStyle = await editor.evaluate((node) => getComputedStyle(node).fontStyle);
      expect(fontStyle).toBe("italic");
      await expect(editor).toHaveText("");
      await expect(page.locator('[role="textbox"][aria-multiline="true"]')).toHaveCount(1);
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
    "backspacing past the slash trigger closes the slash menu",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await openSlashMenuFromEditor(editor, "/he");
      await expectSlashMenuOpen(page);
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");
      await expect(page.getByRole("button", { name: /Heading 1/i })).toHaveCount(0);
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
    "Slash menu",
    "the slash menu can be reopened normally after a previous cancelled use",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await openSlashMenuFromEditor(editor, "/");
      await expectSlashMenuOpen(page);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Backspace");
      await openSlashMenuFromEditor(editor, "/");
      await expectSlashMenuOpen(page);
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
    "typing [] and a space turns the paragraph into a to-do item",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await openSlashMenuFromEditor(editor, "[] ");
      await page.keyboard.type("Todo item");
      await expect(page.locator("button.w-4.h-4")).toHaveCount(1);
      await expect(editor).toHaveText("Todo item");
    },
  ),
  defineScenario(
    "1. Block Creation & Type Selection",
    "Markdown shortcuts",
    "typing [ ] and a space also turns the paragraph into a to-do item",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await openSlashMenuFromEditor(editor, "[ ] ");
      await page.keyboard.type("Todo item");
      await expect(page.locator("button.w-4.h-4")).toHaveCount(1);
      await expect(editor).toHaveText("Todo item");
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
    "typing --- converts the paragraph into a divider",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await openSlashMenuFromEditor(editor, "---");
      await expect(page.getByRole("button", { name: /Divider block/i })).toBeVisible();
      await expect(page.locator("hr")).toHaveCount(1);
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
  defineScenario(
    "1. Block Creation & Type Selection",
    "Markdown shortcuts",
    "markdown shortcuts remove the typed prefix instead of keeping it in the final content",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await openSlashMenuFromEditor(editor, "# ");
      await page.keyboard.type("Clean heading");
      await expect(editor).toHaveText("Clean heading");
      expect(await editorText(editor)).not.toContain("# ");
    },
  ),
];

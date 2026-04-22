/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   contextMenu.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/20 21:29:48 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/20 21:29:49 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  clearAndType,
  contextMenuItem,
  createBlockViaSlash,
  createParagraphs,
  editorHasFocus,
  getEditors,
  openBlockContextMenuForEditor,
  openFreshPage,
  pressEnter,
  pressTab,
  visibleBlockTexts,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

function dragHandle(page, index = 0) {
  return page.getByRole("button", { name: /Drag to reorder block/i }).nth(index);
}

export const contextMenuScenarios = [
  defineScenario(
    "5. Context Menu",
    "Basic operations",
    "right-clicking a block opens the block context menu with its main sections",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Context target"]);
      await openBlockContextMenuForEditor(getEditors(page).first());
      await expect(contextMenuItem(page, "Insert text above")).toBeVisible();
      await expect(contextMenuItem(page, "Move up")).toHaveCount(0);
      await expect(contextMenuItem(page, "Heading 1")).toBeVisible();
      await expect(contextMenuItem(page, "Duplicate")).toBeVisible();
      await expect(contextMenuItem(page, "Delete")).toBeVisible();
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Basic operations",
    "clicking the drag handle opens the same block context menu",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Handle target"]);
      await dragHandle(page).hover();
      await dragHandle(page).click();
      await expect(contextMenuItem(page, "Insert text above")).toBeVisible();
      await expect(contextMenuItem(page, "Duplicate")).toBeVisible();
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Basic operations",
    "Copy text writes the current block text to the clipboard",
    async ({ page, appUrl }) => {
      await page.addInitScript(() => {
        const clipboard = navigator.clipboard;
        (window).__copiedText = null;
        if (!clipboard?.writeText) {
          return;
        }

        const originalWriteText = clipboard.writeText.bind(clipboard);
        Object.defineProperty(clipboard, "writeText", {
          configurable: true,
          value: async (value) => {
            (window).__copiedText = value;
            try {
              return await originalWriteText(value);
            } catch {
              return undefined;
            }
          },
        });
      });
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Copy me"]);
      await expect(getEditors(page).first()).toHaveText("Copy me");
      await openBlockContextMenuForEditor(getEditors(page).first());
      await contextMenuItem(page, "Copy text").click();
      await expect.poll(() => page.evaluate(() => window.__copiedText)).toBe("Copy me");
    },
    { serial: true },
  ),
  defineScenario(
    "5. Context Menu",
    "Basic operations",
    "Insert text above creates a new paragraph above the current block and focuses it",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Existing"]);
      await openBlockContextMenuForEditor(getEditors(page).first());
      await contextMenuItem(page, "Insert text above").click();
      await expect(getEditors(page)).toHaveCount(2);
      expect(await editorHasFocus(getEditors(page).first())).toBe(true);
      await expect(getEditors(page).nth(1)).toHaveText("Existing");
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Basic operations",
    "Insert text below creates a new paragraph below the current block and focuses it",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Existing"]);
      await openBlockContextMenuForEditor(getEditors(page).first());
      await contextMenuItem(page, "Insert text below").click();
      await expect(getEditors(page)).toHaveCount(2);
      expect(await editorHasFocus(getEditors(page).nth(1))).toBe(true);
      await expect(getEditors(page).first()).toHaveText("Existing");
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Basic operations",
    "Duplicate creates an identical leaf block below the original",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Duplicate me"]);
      await openBlockContextMenuForEditor(getEditors(page).first());
      await contextMenuItem(page, "Duplicate").click();
      await expect(getEditors(page)).toHaveCount(2);
      await expect(getEditors(page).first()).toHaveText("Duplicate me");
      await expect(getEditors(page).nth(1)).toHaveText("Duplicate me");
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Basic operations",
    "Move up swaps the selected block with the one above it",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["A", "B", "C"]);
      await openBlockContextMenuForEditor(getEditors(page).nth(1));
      await contextMenuItem(page, "Move up").click();
      expect((await visibleBlockTexts(page)).slice(0, 3)).toEqual(["B", "A", "C"]);
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Basic operations",
    "Move down swaps the selected block with the one below it",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["A", "B", "C"]);
      await openBlockContextMenuForEditor(getEditors(page).nth(1));
      await contextMenuItem(page, "Move down").click();
      expect((await visibleBlockTexts(page)).slice(0, 3)).toEqual(["A", "C", "B"]);
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Basic operations",
    "Turn into Heading 1 transforms the block while preserving its text",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Turn me"]);
      const editor = getEditors(page).first();
      await openBlockContextMenuForEditor(editor);
      await contextMenuItem(page, "Heading 1").click();
      const fontSize = await editor.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).fontSize),
      );
      await expect(editor).toHaveText("Turn me");
      expect(fontSize).toBeGreaterThan(20);
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Context menu + children",
    "Delete removes only the selected leaf block when it has no children",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["A", "B"]);
      await openBlockContextMenuForEditor(getEditors(page).nth(1));
      await contextMenuItem(page, "Delete").click();
      await expect(getEditors(page)).toHaveCount(1);
      await expect(getEditors(page).first()).toHaveText("A");
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Context menu + children",
    "Delete on a parent block removes its whole subtree",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Parent", "Child"]);
      await pressTab(getEditors(page).nth(1));
      await openBlockContextMenuForEditor(getEditors(page).first());
      await contextMenuItem(page, "Delete").click();
      await expect(getEditors(page)).toHaveCount(0);
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Context menu + children",
    "Delete on a toggle parent removes the whole toggle subtree",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      const parent = getEditors(page).first();
      await clearAndType(parent, "Toggle parent");
      await pressEnter(parent);
      await clearAndType(getEditors(page).nth(1), "Toggle child");
      await openBlockContextMenuForEditor(parent);
      await contextMenuItem(page, "Delete").click();
      await expect(getEditors(page)).toHaveCount(0);
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Context menu + children",
    "Duplicate on a parent block duplicates its subtree as independent copies",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Parent", "Child"]);
      await pressTab(getEditors(page).nth(1));
      await openBlockContextMenuForEditor(getEditors(page).first());
      await contextMenuItem(page, "Duplicate").click();
      expect((await visibleBlockTexts(page)).filter((text) => text === "Parent")).toHaveLength(2);
      expect((await visibleBlockTexts(page)).filter((text) => text === "Child")).toHaveLength(2);
      await clearAndType(getEditors(page).first(), "Changed parent");
      expect((await visibleBlockTexts(page)).filter((text) => text === "Parent")).toHaveLength(1);
    },
  ),
];

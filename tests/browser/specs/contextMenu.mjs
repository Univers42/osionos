/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   contextMenu.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/20 21:29:48 by rstancu           #+#    #+#             */
/*   Updated: 2026/05/06 00:08:25 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  blockLocator,
  clearAndType,
  contextMenuItem,
  contextSubMenuItem,
  createBlockViaSlash,
  createNewWorkspacePage,
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
      await expect(contextMenuItem(page, "Turn into")).toBeVisible();
      await expect(contextMenuItem(page, "Duplicate")).toBeVisible();
      await expect(contextMenuItem(page, "Delete")).toBeVisible();
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Basic operations",
    "clicking the drag handle selects the whole block",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Handle target"]);
      await dragHandle(page).hover();
      await dragHandle(page).click();
      await expect(blockLocator(page, 0)).toHaveAttribute("data-selected", "true");
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Basic operations",
    "clicking the drag handle opens the block menu and paints the accent selection tint",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Handle menu target"]);
      await dragHandle(page).hover();
      await dragHandle(page).click();
      await expect(contextMenuItem(page, "Turn into")).toBeVisible();
      await expect(contextMenuItem(page, "Delete")).toBeVisible();
      const block = blockLocator(page, 0);
      await expect(block).toHaveAttribute("data-selected", "true");
      // The selection background is the THEME accent tint, not the neutral hover gray.
      const { actual, accent } = await block.evaluate((el) => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--osio-accent-subtle)";
        document.body.appendChild(probe);
        const resolved = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { actual: getComputedStyle(el).backgroundColor, accent: resolved };
      });
      expect(actual).toBe(accent);
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Basic operations",
    "Copy block then Ctrl+V pastes the block on another page",
    async ({ page, appUrl }) => {
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Travel block"]);
      await dragHandle(page).hover();
      await dragHandle(page).click();
      await contextMenuItem(page, "Copy block").click();
      // Switch to a NEW page client-side (no reload — the in-memory block payload
      // must survive navigation within the tab).
      await createNewWorkspacePage(page);
      const editor = await activateFirstEditor(page);
      await editor.click();
      await page.keyboard.press("Control+v");
      await expect(getEditors(page).first()).toHaveText("Travel block");
    },
    { serial: true },
  ),
  defineScenario(
    "5. Context Menu",
    "Basic operations",
    "Copy text writes the current block text to the clipboard",
    async ({ page, appUrl }) => {
      await page.addInitScript(() => {
        const clipboard = navigator.clipboard;
        globalThis.__copiedText = null;
        if (!clipboard?.writeText) {
          return;
        }

        const originalWriteText = clipboard.writeText.bind(clipboard);
        Object.defineProperty(clipboard, "writeText", {
          configurable: true,
          value: async (value) => {
            globalThis.__copiedText = value;
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
      await expect.poll(() => page.evaluate(() => globalThis.__copiedText)).toBe("Copy me");
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
      await contextMenuItem(page, "Turn into").hover();
      await contextSubMenuItem(page, "Heading 1").click();
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
  defineScenario(
    "5. Context Menu",
    "Visual layout",
    "items container does not overflow into footer (no overlap, no card escape)",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Visual bug test"]);
      await openBlockContextMenuForEditor(getEditors(page).first());

      // Scroll to bottom: no-op with overflow-visible (bug), scrolls with overflow-y-auto (fix).
      // With overflow-visible the last item (Ask AI) renders at its natural overflowing position;
      // with overflow-y-auto it scrolls into the visible area and stays within the container.
      await page.getByRole("menu").evaluate((el) => { el.scrollTop = el.scrollHeight; });

      const lastItemBox = await contextMenuItem(page, "Ask AI").boundingBox();
      const footerBox = await page.getByText("Last edited by current user").boundingBox();
      const cardBox = await page.getByRole("menu").locator("..").boundingBox();

      // Symptom A: last item must not visually overlap the footer
      expect(lastItemBox.y + lastItemBox.height).toBeLessThanOrEqual(footerBox.y + 1);
      // Symptom B: last item must not escape the card's painted boundary
      expect(lastItemBox.y + lastItemBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Visual layout",
    "Turn into and Color submenus still open after subItems guard changes",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Test"]);
      await openBlockContextMenuForEditor(getEditors(page).first());

      await expect(contextMenuItem(page, "Turn into").locator("text=›")).toBeVisible();
      await contextMenuItem(page, "Turn into").hover();
      await expect(page.locator("[data-submenu-panel]")).toBeVisible();
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Component settings",
    "Component settings item appears in the menu and opens no submenu",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Test"]);
      await openBlockContextMenuForEditor(getEditors(page).first());
      await expect(contextMenuItem(page, "Component settings")).toBeVisible();
      await expect(
        contextMenuItem(page, "Component settings").locator("text=›"),
      ).toHaveCount(0);
      await contextMenuItem(page, "Component settings").hover();
      await expect(page.locator("[data-submenu-panel]")).toHaveCount(0);
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Visual layout",
    "footer 'Today' line is fully visible within the card when the scroll area is at capacity",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Footer test"]);
      await openBlockContextMenuForEditor(getEditors(page).first());
      await page.getByRole("menu").evaluate((el) => { el.scrollTop = el.scrollHeight; });
      const card = page.getByRole("menu").locator("..");
      const todayBox = await card.getByText("Today", { exact: true }).boundingBox();
      const cardBox = await card.boundingBox();
      expect(todayBox.y + todayBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Color panel",
    "opening Color shows only the color list — no profile panel",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Color test"]);
      await openBlockContextMenuForEditor(getEditors(page).first());
      await contextMenuItem(page, "Color").hover();
      await expect(page.locator("[data-submenu-panel]")).toBeVisible();
      await expect(contextSubMenuItem(page, "Red text")).toBeVisible();
      await expect(page.locator('aside[aria-label="Color profile properties"]')).toHaveCount(0);
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Color panel",
    "Color's submenu list does not contain a 'Create color profile' entry",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Color test"]);
      await openBlockContextMenuForEditor(getEditors(page).first());
      await contextMenuItem(page, "Color").hover();
      await expect(page.locator("[data-submenu-panel]")).toBeVisible();
      await expect(contextSubMenuItem(page, "Create color profile")).toHaveCount(0);
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Color panel",
    "'Create color profile' is a first-level menu item placed after Color",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Test"]);
      await openBlockContextMenuForEditor(getEditors(page).first());
      const colorItem = contextMenuItem(page, "Color");
      const profileItem = contextMenuItem(page, "Create color profile");
      await expect(colorItem).toBeVisible();
      await expect(profileItem).toBeVisible();
      const colorBox = await colorItem.boundingBox();
      const profileBox = await profileItem.boundingBox();
      expect(profileBox.y).toBeGreaterThan(colorBox.y);
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Color panel",
    "opening 'Create color profile' shows the profile panel and not the color list submenu",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Test"]);
      await openBlockContextMenuForEditor(getEditors(page).first());
      await contextMenuItem(page, "Create color profile").hover();
      await expect(page.locator('aside[aria-label="Color profile properties"]')).toBeVisible();
      await expect(page.locator("[data-submenu-panel]")).toHaveCount(0);
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Color panel",
    "selecting a color from Color's submenu applies the style and closes the menu",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Color me"]);
      await openBlockContextMenuForEditor(getEditors(page).first());
      await contextMenuItem(page, "Color").hover();
      await expect(page.locator("[data-submenu-panel]")).toBeVisible();
      await contextSubMenuItem(page, "Red text").click();
      await expect(page.locator("[data-submenu-panel]")).toHaveCount(0);
      await expect(page.locator("[role='menuitem']")).toHaveCount(0);
      const blockColor = await page.locator("[data-block-id]").first().evaluate((el) => el.style.color);
      expect(blockColor).not.toBe("");
    },
  ),
  defineScenario(
    "5. Context Menu",
    "Color panel",
    "opening Color after 'Create color profile' closes the profile panel",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Test"]);
      await openBlockContextMenuForEditor(getEditors(page).first());
      await contextMenuItem(page, "Create color profile").hover();
      await expect(page.locator('aside[aria-label="Color profile properties"]')).toBeVisible();
      await contextMenuItem(page, "Color").hover();
      await expect(page.locator('aside[aria-label="Color profile properties"]')).toHaveCount(0);
      await expect(page.locator("[data-submenu-panel]")).toBeVisible();
    },
  ),
];

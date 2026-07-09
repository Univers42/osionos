/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   slashMenuPositioning.spec.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The slash-command menu: anchored right above the "/", with a focused search
// bar as its first line, first item pre-selected, full arrow navigation, and
// Escape returning focus to the block.

import { test, expect } from "@playwright/test";

import {
  activateFirstEditor,
  getEditors,
  openFreshPage,
  slashMenu,
} from "../../browser/core/app.mjs";

test.describe("slash-command menu positioning & interaction", () => {
  test("opens right above the /, search bar focused, first item selected", async ({ page }) => {
    await openFreshPage(page, "/");
    const editor = await activateFirstEditor(page);
    await editor.click();
    // Push the caret a few lines down so there is always room ABOVE it.
    for (const word of ["alpha", "beta", "gamma", "delta"]) {
      await page.keyboard.type(word);
      await page.keyboard.press("Enter");
    }
    await page.keyboard.type("/");

    const menu = slashMenu(page);
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box).not.toBeNull();

    // The "/" block is the last editor; its top is the caret line. The menu's
    // BOTTOM edge is pinned ~6px above that line — never the old ~50px gap, and
    // never below the line.
    const blockBox = await getEditors(page).last().boundingBox();
    const blockTopToMenuBottom = blockBox.y - (box.y + box.height);
    expect(blockTopToMenuBottom).toBeGreaterThan(-10); // menu sits above the line
    expect(blockTopToMenuBottom).toBeLessThan(30); // hugging it, no 50px gap

    // Left edge tracks the caret / block start, not drifted to some other x.
    expect(Math.abs(box.x - blockBox.x)).toBeLessThan(40);

    // The search field is focused (the panel's "first line"). Focus settles over
    // a few frames — the sticky guard out-lasts the editor's bounded block-focus
    // retry loop — so poll rather than sampling one instant.
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("data-testid") === "slash-command-search",
      null,
      { timeout: 3000 },
    );

    // First command is highlighted on open.
    await expect(menu.locator('[role="option"]').first()).toHaveAttribute("aria-selected", "true");
  });

  test("typing filters the list, arrows navigate, Enter selects", async ({ page }) => {
    await openFreshPage(page, "/");
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("/");

    const menu = slashMenu(page);
    await expect(menu).toBeVisible();

    // Typing goes into the focused search bar and filters to matching blocks.
    await page.keyboard.type("head");
    const labels = await menu
      .locator('[data-testid="slash-command-entry"]')
      .evaluateAll((els) => els.map((el) => (el.getAttribute("data-command-label") ?? "").toLowerCase()));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((label) => label.includes("head"))).toBe(true);

    const options = menu.locator('[role="option"]');
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
    if ((await options.count()) > 1) {
      await page.keyboard.press("ArrowDown");
      await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("ArrowUp");
      await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
    }

    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();
  });

  test("Escape closes the menu and returns focus to the block", async ({ page }) => {
    await openFreshPage(page, "/");
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("/");
    await expect(slashMenu(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(slashMenu(page)).toBeHidden();
    // Focus returns to the editable block (async — the input unmounts first).
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("role") === "textbox",
      null,
      { timeout: 3000 },
    );
  });

  test("anchors under the / even mid-line, not at the line start", async ({ page }) => {
    await openFreshPage(page, "/");
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("hello world ");
    const blockBox = await getEditors(page).last().boundingBox();
    await page.keyboard.type("/");

    const menu = slashMenu(page);
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    // The "/" sits well to the right of the block's left edge; the menu must
    // follow the caret there, not snap back to the line start (the old bug).
    expect(box.x).toBeGreaterThan(blockBox.x + 40);
  });

  // Root-cause regression: groupSlashCommands re-sorts by section, so the render
  // order differs from the flat command array. Every item selects through the same
  // ordered index, so proving alignment on ONE reordered item (past index 0) proves
  // it for all — this is the "/emoji fired an image" class of bug.
  test("arrow-navigating to an item fires THAT item, not a mis-indexed one", async ({ page }) => {
    await openFreshPage(page, "/");
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("/");

    const menu = slashMenu(page);
    await expect(menu).toBeVisible();
    const options = menu.locator('[role="option"]');
    const labels = await options.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-command-label")),
    );
    // The menu offers a generic empty database block, never a "View: <db>" that
    // fetches an existing database.
    expect(labels.some((l) => l?.startsWith("View:"))).toBe(false);
    expect(labels.some((l) => /database/i.test(l ?? ""))).toBe(true);

    const target = labels.indexOf("Text color");
    expect(target).toBeGreaterThan(0); // must be past index 0 to exercise the reorder

    for (let i = 0; i < target; i += 1) await page.keyboard.press("ArrowDown");
    await expect(options.nth(target)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");

    // "Text color" opens the color menu — never a media/other block.
    await expect(page.getByTestId("color-menu")).toBeVisible();
    await expect(menu).toBeHidden();
  });
});

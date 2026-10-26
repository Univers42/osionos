/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseSettingsPopover.spec.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The View settings popover is pinned to its database's settings button. It is
// placed with window coordinates, so rendered inside the database it landed
// shifted by the offset of the nearest pane (`contain: layout paint`) or layout
// cell (`transform`), and that box clipped it: next to a full-width database it
// was pushed past the pane's right edge and not seen at all.

import { test, expect } from "@playwright/test";

import { activateFirstEditor, openFreshPage, openSlashMenuFromEditor, slashCommandEntry } from "../../browser/core/app.mjs";
import { insertInlineDatabase } from "../support/databaseHelpers.mjs";

async function openSettings(page, block) {
  await expect(block.getByText(/Database|Products|Catalog/).first()).toBeVisible({ timeout: 15_000 });
  await block.scrollIntoViewIfNeeded();
  await block.hover();
  const button = block.locator('button[aria-label="View settings"]');
  await button.click();
  const dialog = page.locator('dialog[open][aria-label="View settings"]');
  await expect(dialog).toBeVisible();
  return { button, dialog };
}

/** Geometry of the popover against the window and its button, plus what is painted at its centre. */
async function measure(page, label = "View settings") {
  return page.evaluate((name) => {
    const dialog = document.querySelector(`dialog[open][aria-label="${name}"]`);
    const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
    const d = box(dialog);
    const button = [...document.querySelectorAll(`button[aria-label="${name}"]`)].find((el) => el.getBoundingClientRect().width > 0);
    const hit = document.elementFromPoint((d.left + d.right) / 2, (d.top + d.bottom) / 2);
    return { dialog: d, button: box(button), viewport: { width: innerWidth, height: innerHeight }, paintedAtCentre: Boolean(hit && dialog.contains(hit)), pageScrollsSideways: document.documentElement.scrollWidth > innerWidth };
  }, label);
}

function expectPinnedOnScreen(m) {
  const slack = 1;
  expect(m.dialog.left).toBeGreaterThanOrEqual(-slack);
  expect(m.dialog.right).toBeLessThanOrEqual(m.viewport.width + slack);
  expect(m.dialog.top).toBeGreaterThanOrEqual(-slack);
  expect(m.dialog.bottom).toBeLessThanOrEqual(m.viewport.height + slack);
  // Next to its button: just below it, or just above it when there is no room below.
  const gapBelow = m.dialog.top - m.button.bottom;
  const gapAbove = m.button.top - m.dialog.bottom;
  expect(Math.min(Math.abs(gapBelow), Math.abs(gapAbove))).toBeLessThanOrEqual(12);
  // Spans the button horizontally (right-aligned to it, or clamped to the window).
  expect(m.dialog.left).toBeLessThanOrEqual(m.button.right);
  expect(m.dialog.right).toBeGreaterThanOrEqual(m.button.left);
  expect(m.paintedAtCentre, "nothing clips or covers the popover").toBe(true);
  expect(m.pageScrollsSideways).toBe(false);
}

test.describe("database-settings-popover", () => {
  test("opens next to the settings button of an inline database", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const block = await insertInlineDatabase(page);
    const { button, dialog } = await openSettings(page, block);
    expectPinnedOnScreen(await measure(page));

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test("stays on screen next to a full-width database", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const block = await insertInlineDatabase(page);
    await page.getByRole("button", { name: "Open page configuration" }).click();
    await page.getByRole("button", { name: "Full width" }).click();
    await page.keyboard.press("Escape");
    const { dialog } = await openSettings(page, block);
    const m = await measure(page);
    expectPinnedOnScreen(m);

    // A click beside it, over the table, closes it.
    await page.getByRole("button", { name: "Close view settings" })
      .click({ position: { x: m.dialog.left - 40, y: m.dialog.top + 40 } });
    await expect(dialog).toHaveCount(0);
  });

  test("stays on screen for a database inside a layout cell", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await openSlashMenuFromEditor(editor, "/layout");
    const entry = slashCommandEntry(page, "Layout full page").last();
    await entry.waitFor();
    await entry.evaluate((node) => node.click());
    const block = page.locator(".osionos-layout-cell .osionos-database-block").first();
    await block.waitFor({ timeout: 20_000 });
    await openSettings(page, block);
    expectPinnedOnScreen(await measure(page));
  });

  test("Sort opens as a popover under its button, not a panel in the page flow", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const block = await insertInlineDatabase(page);
    await expect(block.getByText("Untitled Database").first()).toBeVisible({ timeout: 15_000 });
    await block.hover();
    const button = block.getByRole("button", { name: "Sort", exact: true });
    await button.click();
    const dialog = page.locator('dialog[open][aria-label="Sort"]');
    // With no sort yet it opens on the property search.
    await expect(dialog.getByRole("textbox", { name: "Sort by property" })).toBeFocused();
    expectPinnedOnScreen(await measure(page, "Sort"));

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test("fits a phone-width window", async ({ page }) => {
    // The slash menu is laid out for a desktop pane; narrow the window once the block exists.
    await page.setViewportSize({ width: 1440, height: 900 });
    const block = await insertInlineDatabase(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await openSettings(page, block);
    expectPinnedOnScreen(await measure(page));
  });
});

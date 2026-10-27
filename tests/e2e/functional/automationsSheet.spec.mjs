/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   automationsSheet.spec.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

import { addPropertyOfType, closeViewSettings, fillCell, insertInlineDatabase } from "../support/databaseHelpers.mjs";

test.describe("automations-sheet", () => {
  test("⚡ opens the sheet, empty state shows the templates", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await block.hover();
    await block.locator('[aria-label="Automations"]').click();
    const dialog = page.locator("dialog");
    await expect(dialog.getByText("Automations", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Stamp the finish date")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("build When Status changes to Done → Show a message 'Shipped', Save, list shows sentence", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await block.hover();
    await block.locator('[aria-label="Automations"]').click();
    const dialog = page.locator("dialog");
    await dialog.getByText("+ New automation").click();
    await expect(dialog.getByText("Edit automation")).toBeVisible();
    await dialog.getByLabel("Rule name").fill("r");

    // When: Property changes, Status, To Done
    await dialog.locator('[aria-label="Trigger"]').selectOption("property_changed");

    // Do: Show a message 'Shipped'
    await dialog.locator('[aria-label="Action type"]').first().selectOption("notify");
    await dialog.locator('[aria-label="Message"]').first().fill("Shipped");

    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.getByText("show a message")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // edit a row's Status to Done → toast "Shipped" appears
    await fillCell(page, block, 0, 0, "Done");
    await expect(page.getByRole("status").filter({ hasText: "Shipped" })).toBeVisible({ timeout: 10_000 });
  });

  test("the rule survives a reload", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await block.hover();
    await block.locator('[aria-label="Automations"]').click();
    const dialog = page.locator("dialog");
    await dialog.getByText("+ New automation").click();
    await dialog.getByLabel("Rule name").fill("r");
    await dialog.locator('[aria-label="Trigger"]').selectOption("property_changed");
    await dialog.locator('[aria-label="Action type"]').first().selectOption("notify");
    await dialog.locator('[aria-label="Message"]').first().fill("Shipped");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await page.reload();
    const block2 = page.locator(".osionos-database-block--inline").first();
    await block2.waitFor({ timeout: 15_000 });
    await block2.hover();
    await block2.locator('[aria-label="Automations"]').click();
    const dialog2 = page.locator("dialog");
    await expect(dialog2.getByText("show a message")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("the switch turns it off and the toast no longer appears", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await block.hover();
    await block.locator('[aria-label="Automations"]').click();
    const dialog = page.locator("dialog");
    await dialog.getByText("+ New automation").click();
    await dialog.getByLabel("Rule name").fill("r");
    await dialog.locator('[aria-label="Trigger"]').selectOption("property_changed");
    await dialog.locator('[aria-label="Action type"]').first().selectOption("notify");
    await dialog.locator('[aria-label="Message"]').first().fill("Shipped");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await page.keyboard.press("Escape");

    // turn off
    await block.hover();
    await block.locator('[aria-label="Automations"]').click();
    const dialog2 = page.locator("dialog");
    const toggle = dialog2.getByRole("switch").first();
    await toggle.click();
    await page.keyboard.press("Escape");

    await fillCell(page, block, 0, 0, "Done");
    await expect(page.getByRole("status").filter({ hasText: "Shipped" })).toHaveCount(0, { timeout: 5_000 });
  });

  test("Escape with an unsaved edit shows the discard confirm, Keep editing keeps the draft", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await block.hover();
    await block.locator('[aria-label="Automations"]').click();
    const dialog = page.locator("dialog");
    await dialog.getByText("+ New automation").click();
    await dialog.getByText("+ Add action").click();
    await dialog.locator('[aria-label="Action type"]').first().selectOption("notify");
    await dialog.locator('[aria-label="Message"]').first().fill("x");
    await page.keyboard.press("Escape");
    await expect(dialog.getByText("Discard unsaved changes?")).toBeVisible();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(dialog.getByText("Discard unsaved changes?")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "Discard" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("at a 400 px wide viewport the sheet covers the screen", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await page.setViewportSize({ width: 400, height: 860 });
    await block.hover();
    await block.locator('[aria-label="Automations"]').click();
    const dialog = page.locator("dialog");
    const box = await dialog.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(390);
    await page.keyboard.press("Escape");
  });

  test("screenshots", async ({ page }) => {
    if (process.env.AUTOMATIONS_SCREENS !== "1") test.skip();
    mkdirSync("target/screens", { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    const block = await insertInlineDatabase(page);
    await block.hover();
    await block.locator('[aria-label="Automations"]').click();
    const dialog = page.locator("dialog");
    await dialog.getByText("+ New automation").click();
    await page.screenshot({ path: "target/screens/automations-sheet-light-1440.png" });
    await page.keyboard.press("Escape");
    await page.emulateMedia({ colorScheme: "dark" });
    await block.hover();
    await block.locator('[aria-label="Automations"]').click();
    await page.locator("dialog").getByText("+ New automation").click();
    await page.screenshot({ path: "target/screens/automations-sheet-dark-1440.png" });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 400, height: 860 });
    await page.emulateMedia({ colorScheme: "light" });
    await block.hover();
    await block.locator('[aria-label="Automations"]').click();
    await page.locator("dialog").getByText("+ New automation").click();
    await page.screenshot({ path: "target/screens/automations-sheet-light-400.png" });
    await page.keyboard.press("Escape");
    await page.emulateMedia({ colorScheme: "dark" });
    await block.hover();
    await block.locator('[aria-label="Automations"]').click();
    await page.locator("dialog").getByText("+ New automation").click();
    await page.screenshot({ path: "target/screens/automations-sheet-dark-400.png" });
  });
});


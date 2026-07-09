/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseAutomations.spec.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/08 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Database automations (Notion parity): the ⚡ toolbar button opens the rule
// list directly; a "Row edited" rule auto-sets a property and raises a toast;
// a Button property configured via "Edit button" runs its actions on click.

import { test, expect } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  openSlashMenuFromEditor,
  slashCommandEntry,
} from "../../browser/core/app.mjs";

async function insertInlineDatabase(page) {
  await openFreshPage(page, "/");
  const editor = await activateFirstEditor(page);
  await openSlashMenuFromEditor(editor, "/database");
  await slashCommandEntry(page, "Database - Inline").click();
  const block = page.locator(".osionos-database-block--inline").first();
  await block.waitFor({ timeout: 15_000 });
  return block;
}

/** Add a property of `type`, rename it in the auto-opened config panel, close. */
async function addNamedProperty(page, block, typeLabel, name) {
  await block.locator('[aria-label="Add property"]').click();
  await page.getByTestId("add-property-panel")
    .getByRole("button", { name: typeLabel, exact: true }).click();
  const config = page.getByTestId("property-config-panel");
  const nameInput = config.getByPlaceholder("Property name");
  await nameInput.fill(name);
  await nameInput.press("Enter");
  await page.getByRole("textbox", { name: "Page title" }).click(); // close panel
  await expect(config).toHaveCount(0);
}

async function fillCell(page, block, row, col, value) {
  const cell = block.locator("tbody tr").nth(row).locator("td").nth(col);
  await cell.dblclick();
  await cell.locator("input, textarea").first().fill(value);
  await page.keyboard.press("Enter");
}

test.describe("database-automations", () => {
  test("⚡ opens the Automations screen; creating a rule shows the count pill", async ({ page }) => {
    const block = await insertInlineDatabase(page);

    await block.hover();
    await block.locator('[aria-label="Automations"]').click();
    const dialog = page.locator("dialog");
    await expect(dialog.getByText("Automations", { exact: true })).toBeVisible();
    await expect(dialog.getByText("+ New automation")).toBeVisible();

    // Creating a rule drops straight into its editor.
    await dialog.getByText("+ New automation").click();
    await expect(dialog.getByText("Edit automation")).toBeVisible();
    await expect(dialog.locator('[aria-label="Trigger"]')).toHaveValue("row_updated");

    // Close the settings dialog via the backdrop.
    await page.locator('button[aria-label="Close"][tabindex="-1"]').click();
    await expect(dialog).toHaveCount(0);

    // The ⚡ button now carries the local-rule count pill.
    await block.hover();
    await expect(block.locator('[aria-label="Automations"]')).toContainText("1");
  });

  test("Row edited rule: set_property + notify fire on a cell edit", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await addNamedProperty(page, block, "Text", "Trigger");
    await addNamedProperty(page, block, "Text", "Target");

    // Rule: on row edit, set Target = "auto-set" and notify.
    await block.hover();
    await block.locator('[aria-label="Automations"]').click();
    const dialog = page.locator("dialog");
    await dialog.getByText("+ New automation").click();
    await expect(dialog.getByText("Edit automation")).toBeVisible();
    const action = dialog.locator('[aria-label="Action type"]').first();
    await action.selectOption("set_property");
    await dialog.locator('[aria-label="Column"]').first().selectOption({ label: "Target" });
    await dialog.locator('[aria-label="Value"]').first().fill("auto-set");
    await dialog.getByText("+ Add action").click();
    await dialog.locator('[aria-label="Message"]').last().fill("Rule fired");
    await page.locator('button[aria-label="Close"][tabindex="-1"]').click();

    // Edit the Trigger cell → the rule writes Target and raises a toast.
    await fillCell(page, block, 0, 2, "hello");
    const targetCell = block.locator("tbody tr").first().locator("td").nth(3);
    await expect(targetCell).toContainText("auto-set", { timeout: 10_000 });
    await expect(page.getByRole("status").filter({ hasText: "Rule fired" })).toBeVisible();
  });

  test("Button property: Edit button config runs set_property + notify on click", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await addNamedProperty(page, block, "Text", "Target");

    // Add a Button property; configure it in the auto-opened config panel.
    await block.locator('[aria-label="Add property"]').click();
    await page.getByTestId("add-property-panel")
      .getByRole("button", { name: "Button", exact: true }).click();
    const config = page.getByTestId("property-config-panel");
    await config.getByText("Edit button").click();

    const editor = page.getByTestId("button-editor-panel");
    await expect(editor.locator('[aria-label="Button label"]')).toHaveValue("Button");
    await editor.getByText("+ Add action").click();
    await editor.locator('[aria-label="Column"]').first().selectOption({ label: "Target" });
    await editor.locator('[aria-label="Value"]').first().fill("pressed");
    await editor.getByText("+ Add action").click();
    await editor.locator('[aria-label="Action type"]').last().selectOption("notify");
    await editor.locator('[aria-label="Message"]').last().fill("Button clicked");
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor).toHaveCount(0);
    await page.getByRole("textbox", { name: "Page title" }).click(); // close config panel

    // Click the row's button → property set + toast.
    await block.locator("tbody tr").first().locator("td").nth(3)
      .getByRole("button", { name: "Button", exact: true }).click();
    const targetCell = block.locator("tbody tr").first().locator("td").nth(2);
    await expect(targetCell).toContainText("pressed", { timeout: 10_000 });
    await expect(page.getByRole("status").filter({ hasText: "Button clicked" })).toBeVisible();
  });
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseDatePanel.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          #+#    #+#             */
/*   Created: 2026/07/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The date-property panel controls all DO something: the End date + Include
// time switches toggle, Date format changes how the value renders, and Remind
// persists. Each setting sticks on the property (survives reopen / re-render).

import { test, expect } from "@playwright/test";

import { addPropertyOfType, insertInlineDatabase } from "../support/databaseHelpers.mjs";

async function openDateCellPicker(page) {
  const block = await insertInlineDatabase(page);
  await block.hover();
  await block.getByRole("button", { name: "New", exact: true }).last().click();
  await addPropertyOfType(block, page, "Date", "When");
  const cell = block.locator("tbody tr").first().getByText("Empty", { exact: true }).last();
  await cell.dblclick();
  await page.getByPlaceholder("Start date").waitFor({ timeout: 5_000 });
  return block;
}

test.describe("database-date-panel", () => {
  test("the End date switch toggles the interval on and off", async ({ page }) => {
    const block = await openDateCellPicker(page);
    await page.getByPlaceholder("Start date").fill("Jul 8, 2026");
    await page.getByPlaceholder("Start date").press("Enter");

    // Click the SWITCH itself (not just the label) — the bug was the switch
    // swallowing the click.
    await page.getByRole("switch", { name: "End date" }).click();
    await page.keyboard.press("Escape");
    const cell = block.locator("td").filter({ hasText: "Jul 8, 2026" }).first();
    await expect(cell).toContainText("→");
  });

  test("Date format changes how the value is rendered", async ({ page }) => {
    const block = await openDateCellPicker(page);
    await page.getByPlaceholder("Start date").fill("Jul 8, 2026");
    await page.getByPlaceholder("Start date").press("Enter");

    await page.getByRole("button", { name: /^Date format/ }).click();
    await page.getByRole("menuitem", { name: "Year/Month/Day" }).click();
    await page.keyboard.press("Escape");

    await expect(block.locator("td").filter({ hasText: "2026/07/08" }).first()).toBeVisible();
  });

  test("Include time makes the value carry and show a time", async ({ page }) => {
    const block = await openDateCellPicker(page);
    await page.getByPlaceholder("Start date").fill("Jul 8, 2026");
    await page.getByPlaceholder("Start date").press("Enter");

    await page.getByRole("switch", { name: "Include time" }).click();
    // A time field appears once time is included.
    const timeInput = page.getByLabel("Start time");
    await timeInput.waitFor({ timeout: 5_000 });
    await timeInput.fill("09:30");
    await page.keyboard.press("Escape");

    const cell = block.locator("td").filter({ hasText: "Jul 8, 2026" }).first();
    await expect(cell).toContainText(/AM|PM/);
  });

  test("Remind persists across reopen", async ({ page }) => {
    const block = await openDateCellPicker(page);
    await page.getByPlaceholder("Start date").fill("Jul 8, 2026");
    await page.getByPlaceholder("Start date").press("Enter");

    await page.getByRole("button", { name: /^Remind/ }).click();
    await page.getByRole("menuitem", { name: "1 hour before" }).click();
    await page.keyboard.press("Escape");

    // Reopen the cell — the choice stuck on the property.
    await block.locator("td").filter({ hasText: "Jul 8, 2026" }).first().dblclick();
    await expect(page.getByRole("button", { name: /^Remind/ })).toContainText("1 hour before");
  });
});

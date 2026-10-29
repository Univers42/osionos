/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseRangeClipboard.spec.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 08:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 08:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Select several cells of one column (drag, Shift+click, Shift+arrows), copy
// them, and paste them into other rows with the real Ctrl+C / Ctrl+V keys.
// Ctrl+V used to be taken by the page's block paste, so the cells never changed.

import { test, expect } from "@playwright/test";

import { fillCell, insertInlineDatabase } from "../support/databaseHelpers.mjs";

const NAME_COL = 0;

async function tableWithNames(page, names) {
  const block = await insertInlineDatabase(page);
  await block.hover();
  const newRow = block.getByRole("button", { name: "New", exact: true }).last();
  // Records only: the "+ New" row is a <tr> of the same body.
  const rows = block.locator("tbody tr[data-page-id]");
  await expect(rows.first()).toBeVisible(); // the starter record
  for (let count = await rows.count(); count < names.length; count++) {
    await newRow.click();
    await expect(rows).toHaveCount(count + 1);
  }
  for (const [row, name] of names.entries()) await fillCell(page, block, row, NAME_COL, name);
  const cell = (row) => rows.nth(row).locator("td").nth(NAME_COL);
  return { block, cell };
}

// The focused title cell also shows its OPEN pill.
function named(text) {
  return new RegExp(`^${text}( OPEN)?$`);
}

test.describe("database-range-clipboard", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  });

  test("drag-select two cells, copy, Shift+click two others, paste", async ({ page }) => {
    const { block, cell } = await tableWithNames(page, ["Alpha", "Beta", "Gamma", "Delta"]);

    await cell(0).hover();
    await page.mouse.down();
    await cell(1).hover();
    await page.mouse.up();
    await expect(block.locator('td[aria-selected="true"]')).toHaveCount(2);
    await page.keyboard.press("Control+C");

    await cell(2).click();
    await cell(3).click({ modifiers: ["Shift"] });
    await expect(block.locator('td[aria-selected="true"]')).toHaveCount(2);
    await page.keyboard.press("Control+V");

    await expect(cell(2)).toHaveText(named("Alpha"));
    await expect(cell(3)).toHaveText(named("Beta"));
    // The paste went into the cells, not into the page as new blocks.
    await expect(page.getByText("Alpha", { exact: true })).toHaveCount(2);
  });

  test("one copied value fills a Shift+arrow selection; Delete clears it", async ({ page }) => {
    const { block, cell } = await tableWithNames(page, ["Alpha", "Beta", "Gamma", "Delta"]);

    await cell(0).click();
    await page.keyboard.press("Control+C");
    await cell(1).click();
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+ArrowDown");
    await expect(block.locator('td[aria-selected="true"]')).toHaveCount(3);
    await page.keyboard.press("Control+V");
    for (const row of [1, 2, 3]) await expect(cell(row)).toHaveText(named("Alpha"));

    await page.keyboard.press("Delete");
    for (const row of [1, 2, 3]) await expect(cell(row)).not.toContainText("Alpha");
    await expect(cell(0)).toHaveText(named("Alpha"));
  });

  test("spreadsheet text pastes down the column from the selected cell", async ({ page }) => {
    const { cell } = await tableWithNames(page, ["Alpha", "Beta", "Gamma"]);
    await page.evaluate(() => navigator.clipboard.writeText("North\r\nSouth\r\n"));

    await cell(1).click();
    await page.keyboard.press("Control+V");

    await expect(cell(0)).toHaveText(named("Alpha"));
    await expect(cell(1)).toHaveText(named("North"));
    await expect(cell(2)).toHaveText(named("South"));
  });

  test("Escape collapses a range first, then leaves the grid", async ({ page }) => {
    const { block, cell } = await tableWithNames(page, ["Alpha", "Beta"]);
    await cell(0).click();
    await page.keyboard.press("Shift+ArrowDown");
    await expect(block.locator('td[aria-selected="true"]')).toHaveCount(2);

    await page.keyboard.press("Escape");
    await expect(block.locator('td[aria-selected="true"]')).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(block.locator('td[aria-selected="true"]')).toHaveCount(0);
  });
});

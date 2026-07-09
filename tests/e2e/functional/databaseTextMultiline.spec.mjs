/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseTextMultiline.spec.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A `text` property cell is multiline: Shift+Enter inserts a newline and typing
// continues inside the SAME cell; plain Enter commits the value.

import { test, expect } from "@playwright/test";

import { addTextProperty, insertInlineDatabase } from "../support/databaseHelpers.mjs";

test.describe("database-text-multiline", () => {
  test("Shift+Enter continues writing on a new line inside a text property cell", async ({ page }) => {
    const block = await insertInlineDatabase(page);

    // One row (the table-bottom "+ New" adds silently — the topbar New would
    // open the record modal over the table) + one Text property.
    await block.hover();
    await block.getByRole("button", { name: "New", exact: true }).last().click();
    await addTextProperty(block, page);

    // The text cell of the first row is the LAST "Empty" editable cell (the
    // title cell also renders "Empty" when blank). Spreadsheet model: click
    // selects, DOUBLE-click starts editing.
    await block.locator("tbody tr").first().getByText("Empty", { exact: true }).last().dblclick();

    await page.keyboard.type("first line");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("second line");
    await page.keyboard.press("Enter");

    // Both lines committed into the SAME cell, separated by a real newline.
    const cell = block.locator("td").filter({ hasText: "first line" }).first();
    await expect(cell).toContainText("second line");
    const text = await cell.textContent();
    expect(text).toContain("first line\nsecond line");
  });
});

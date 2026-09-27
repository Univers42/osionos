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

    // Locate the Text column ("Notes") cell by structural column index so
    // Playwright's locator chain does not invalidate once "Empty" placeholder vanishes.
    const colIndex = await block
      .locator("thead th")
      .allTextContents()
      .then((headers) => headers.findIndex((h) => h.includes("Notes")));
    const cell = block.locator("tbody tr").first().locator("td").nth(colIndex >= 0 ? colIndex : 2);

    await cell.click();
    await page.keyboard.press("Enter");
    const textarea = cell.locator("textarea").first();
    await textarea.waitFor({ state: "visible", timeout: 10_000 });
    await textarea.focus();

    await page.keyboard.type("first line");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("second line");
    await page.keyboard.press("Enter");

    // Both lines committed into the SAME cell, separated by a real newline.
    await expect(cell).toContainText("first line");
    await expect(cell).toContainText("second line");
    const text = await cell.textContent();
    expect(text).toContain("first line\nsecond line");
  });
});

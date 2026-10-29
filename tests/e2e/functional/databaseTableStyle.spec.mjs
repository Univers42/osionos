/* ************************************************************************** */
/*                                                                            */
/*   databaseTableStyle.spec.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur         #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// The table view's "Minimal" style (View settings > Layout > Style): no grid
// lines, a quiet header, 36 px rows. Any table can pick it; the Library uses it.

import { expect, test } from "@playwright/test";

import { closeViewSettings, insertInlineDatabase } from "../support/databaseHelpers.mjs";

async function openLayout(page, block) {
  await block.hover();
  await block.locator('[aria-label="View settings"]').click();
  const dialog = page.locator("dialog");
  await dialog.getByText("Layout", { exact: true }).first().click();
  return dialog;
}

/** The first body cell's height and right border, and the header cell's right border. */
async function cellLook(block) {
  return block.locator("table").evaluate((table) => {
    const cell = table.querySelector("tbody td:nth-child(1)");
    const head = table.querySelector("thead th");
    return {
      style: table.dataset.tableStyle,
      rowHeight: Math.round(cell.getBoundingClientRect().height),
      cellRight: getComputedStyle(cell).borderRightWidth,
      headRight: getComputedStyle(head).borderRightWidth,
    };
  });
}

test.describe("table style", () => {
  test("Minimal drops the grid and sets 36 px rows; Default brings them back", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    expect(await cellLook(block)).toMatchObject({ style: "default", cellRight: "1px" });

    let dialog = await openLayout(page, block);
    const styleRow = dialog.getByRole("menuitem", { name: /^Style/ });
    await expect(styleRow).toContainText("Default");
    await styleRow.click();
    await dialog.getByRole("button", { name: "Minimal", exact: true }).click();
    await closeViewSettings(page);

    expect(await cellLook(block)).toEqual({ style: "minimal", rowHeight: 36, cellRight: "0px", headRight: "0px" });

    dialog = await openLayout(page, block);
    await expect(dialog.getByRole("menuitem", { name: /^Style/ })).toContainText("Minimal");
    // Vertical lines mean nothing without a grid, so the switch steps aside.
    await expect(dialog.getByText("Show vertical lines", { exact: true })).toHaveCount(0);
    await dialog.getByRole("menuitem", { name: /^Style/ }).click();
    await dialog.getByRole("button", { name: "Default", exact: true }).click();
    await closeViewSettings(page);
    expect(await cellLook(block)).toMatchObject({ style: "default", cellRight: "1px" });
  });
});

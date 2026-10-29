/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseViewSwitch.spec.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// An inline database renders every view in one slot. Switching between two
// views of the same type must not carry one view's local state into the other:
// a group collapsed in the first table stayed collapsed in its duplicate.

import { expect, test } from "@playwright/test";

import { closeViewSettings, fillCell, insertInlineDatabase } from "../support/databaseHelpers.mjs";

test("a group collapsed in one table view stays open in another", async ({ page }) => {
  const block = await insertInlineDatabase(page);
  await block.locator('[aria-label="Add property"]').click();
  await page.getByTestId("add-property-panel").getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("textbox", { name: "Page title" }).click(); // close the auto-opened config panel
  await expect(page.getByTestId("property-config-panel")).toHaveCount(0);
  await fillCell(page, block, 0, 1, "alpha");
  await block.getByRole("button", { name: "New", exact: true }).last().click();
  await fillCell(page, block, 1, 1, "beta");

  await block.hover();
  await block.locator('[aria-label="View settings"]').click();
  const dialog = page.locator("dialog");
  if ((await dialog.getByText("Group by").count()) === 0) {
    await dialog.getByText("Layout", { exact: true }).first().click();
  }
  await dialog.getByText("Group by").first().click();
  await dialog.getByRole("button", { name: "Text", exact: true }).click();
  await closeViewSettings(page);

  await block.getByRole("button", { name: "Collapse group alpha" }).click();
  await expect(block.getByRole("button", { name: "Expand group alpha" })).toBeVisible();

  await block.hover();
  await block.locator('[aria-label="More options"]').click();
  await page.getByText("Duplicate view", { exact: true }).click();
  await block.getByText(/\(copy\)/).first().click();

  await expect(block.getByRole("button", { name: "Collapse group alpha" })).toBeVisible();
});

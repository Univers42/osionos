/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseDatePicker.spec.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A date cell's picker opens below the cell, or above it when the room below is
// short. It used to clamp its top into the window instead, which slid it up
// over the very cell being edited whenever that cell sat low in the window.

import { test, expect } from "@playwright/test";

import { addPropertyOfType, insertInlineDatabase } from "../support/databaseHelpers.mjs";

function picker(page) {
  return page.locator("dialog[open]").filter({ hasText: "Include time" });
}

/** Enter on the selected cell opens its picker. */
async function openPicker(page, cell) {
  await page.keyboard.press("Enter");
  await expect(picker(page)).toBeVisible();
  return { cell: await cell.boundingBox(), picker: await picker(page).boundingBox(), window: page.viewportSize() };
}

const roomBelow = ({ cell, window }) => window.height - (cell.y + cell.height);

test("a date picker opens below its cell when it fits there, else above it, never over it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  const block = await insertInlineDatabase(page);
  await expect(block.getByText("Untitled Database").first()).toBeVisible({ timeout: 15_000 });
  await addPropertyOfType(block, page, "Date", "Due");
  const headers = await block.locator("thead th").allTextContents();
  const due = block.locator("tbody tr").first().locator("td").nth(headers.findIndex((header) => header.includes("Due")));

  await due.click();
  await expect(block.locator("[aria-activedescendant]").first()).toHaveAttribute("aria-activedescendant", /odb-cell:/);
  const roomy = await openPicker(page, due);
  expect(roomBelow(roomy)).toBeGreaterThan(roomy.picker.height);
  expect(roomy.picker.y).toBeGreaterThanOrEqual(roomy.cell.y + roomy.cell.height);
  await page.keyboard.press("Escape");
  await expect(picker(page)).toHaveCount(0);
  // Escape closes the picker only; the cell stays selected.
  await expect(block.locator("[aria-activedescendant]").first()).toHaveAttribute("aria-activedescendant", /odb-cell:/);

  // The same cell, still selected, in a shorter window: the room below no
  // longer fits the picker.
  await page.setViewportSize({ width: 1440, height: 800 });
  const cramped = await openPicker(page, due);
  expect(roomBelow(cramped)).toBeLessThan(cramped.picker.height);
  expect(cramped.picker.y + cramped.picker.height).toBeLessThanOrEqual(cramped.cell.y + 1);
  expect(cramped.picker.y).toBeGreaterThanOrEqual(0);
});

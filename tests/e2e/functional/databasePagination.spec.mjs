/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databasePagination.spec.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/09 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/09 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The "Limit" view setting + record page navigation. A finite limit windows a
// view into pages navigated above the records; the +New row stays at the
// bottom of the current page.

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

/** Open View settings → Layout, pick a Limit option, close the panel. */
async function setLimit(page, block, optionLabel) {
  await block.hover();
  await block.locator('[aria-label="View settings"]').click();
  const dialog = page.locator("dialog");
  if ((await dialog.getByRole("menuitem", { name: /Limit/ }).count()) === 0) {
    await dialog.getByText("Layout", { exact: true }).first().click();
  }
  await dialog.getByRole("menuitem", { name: /Limit/ }).click();
  await dialog.getByRole("button", { name: optionLabel, exact: true }).click();
  await page.locator('button[aria-label="Close"][tabindex="-1"]').click();
  await expect(dialog).toHaveCount(0);
}

test.describe("database-pagination", () => {
  test("Limit setting lives in Layout with options 25/50/75/100/All and persists", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await block.hover();
    await block.locator('[aria-label="View settings"]').click();
    const dialog = page.locator("dialog");
    await dialog.getByText("Layout", { exact: true }).first().click();

    const limitRow = dialog.getByRole("menuitem", { name: /Limit/ });
    await expect(limitRow).toBeVisible();
    await expect(limitRow).toContainText("50"); // default page size

    await limitRow.click();
    for (const label of ["25", "50", "75", "100", "All"]) {
      await expect(dialog.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    await dialog.getByRole("button", { name: "25", exact: true }).click();
    await expect(dialog.getByRole("menuitem", { name: /Limit/ })).toContainText("25");
  });

  test("a finite limit windows the table into navigable pages; +New stays", async ({ page }) => {
    const block = await insertInlineDatabase(page);

    // Seed 26 rows (1 starter + 25) so a limit of 25 spills onto a second page.
    const newRow = block.getByRole("button", { name: "New", exact: true });
    for (let i = 0; i < 25; i += 1) await newRow.last().click();

    await setLimit(page, block, "25");

    // The pager appears above the records: "1–25 of 26", page 1 active.
    const nav = block.locator('nav[aria-label="Record pages"]');
    await expect(nav).toBeVisible();
    await expect(nav).toContainText("of 26");
    await expect(nav.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    // The +New row is still present on page 1.
    await expect(block.getByRole("button", { name: "New", exact: true }).last()).toBeVisible();

    // Navigate to page 2 → the remaining record, +New still there.
    await nav.getByRole("button", { name: "Page 2" }).click();
    await expect(nav.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
    await expect(nav).toContainText("26"); // "26–26 of 26"
    await expect(block.getByRole("button", { name: "New", exact: true }).last()).toBeVisible();
  });
});

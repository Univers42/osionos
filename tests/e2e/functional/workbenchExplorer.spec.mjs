/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workbenchExplorer.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

async function bootWorkbench(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  // Failed-resource noise is the offline build having no bridge, not a UI error.
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/Failed to load resource|ERR_|net::/i.test(msg.text())) errors.push(msg.text());
  });
  await page.addInitScript(() => {
    try { localStorage.setItem("osio.workbench", "1"); } catch { /* ignore */ }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  return errors;
}

test("explorer lists at least one treeitem", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await bootWorkbench(page);
  const treeitems = page.getByRole("treeitem");
  await expect(treeitems.first()).toBeVisible({ timeout: 10_000 });
  const count = await treeitems.count();
  expect(count).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("clicking first page row opens it and highlights it exclusively", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await bootWorkbench(page);
  const pageRows = page.locator('[role="treeitem"][data-rel$=".omd"]');
  await expect(pageRows.first()).toBeVisible({ timeout: 10_000 });
  await pageRows.first().click();
  // The clicked row should have aria-selected="true"
  await expect(pageRows.first()).toHaveAttribute("aria-selected", "true");
  // No other treeitem should have aria-selected="true"
  const otherSelected = page.getByRole("treeitem", { selected: true });
  const count = await otherSelected.count();
  expect(count).toBe(1);
  expect(errors).toEqual([]);
});

test("collapse all, import/export buttons, and honest delete copy", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await bootWorkbench(page);

  // Create a folder so there is a directory row to expand.
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  const input = page.locator('[role="tree"] input');
  await input.waitFor({ state: "visible" });
  await input.fill("test-folder");
  await input.press("Enter");

  // Expand the folder row with ArrowRight.
  const folderRow = page.locator('[role="treeitem"][data-rel="test-folder"]');
  await expect(folderRow).toBeVisible({ timeout: 10_000 });
  await folderRow.focus();
  await page.keyboard.press("ArrowRight");
  await expect(folderRow).toHaveAttribute("aria-expanded", "true");

  // Collapse all: no treeitem should remain expanded.
  await page.getByRole("button", { name: "Collapse all", exact: true }).click();
  await expect(page.locator('[role="treeitem"][aria-expanded="true"]')).toHaveCount(0);

  // The toolbar shows Import folder and Export as .zip.
  await expect(page.getByRole("button", { name: "Import folder", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export as .zip", exact: true })).toBeVisible();

  // Trigger delete on a page row: the dialog text contains "trash".
  const pageRow = page.locator('[role="treeitem"][data-rel$=".omd"]').first();
  await expect(pageRow).toBeVisible({ timeout: 10_000 });
  await pageRow.focus();
  await page.keyboard.press("Delete");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("trash");

  // Cancel leaves the row in place.
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(pageRow).toBeVisible();

  expect(errors).toEqual([]);
});

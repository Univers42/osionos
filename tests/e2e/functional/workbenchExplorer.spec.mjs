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

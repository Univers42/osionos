/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseSortFilter.spec.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Regression: opening Sort or Filter on a database view used to crash the whole
// block (Object.values(db.properties) on a schema with no properties map → the
// error boundary blanked the region). The DatabaseBlock error boundary wraps the
// TopBar too, so if a panel throws on open the Sort/Filter/Add-view chrome
// vanishes — asserting the chrome survives is the no-crash signal. Exercised on
// the ?home=database surface = the real, pre-existing workspace Files database.

import { test, expect } from "@playwright/test";

test.describe("database-sort-filter", () => {
  test.describe.configure({ mode: "serial" });

  async function openDatabaseSurface(page) {
    await page.goto("/?home=database");
    // The surface lazy-loads; "+ Add view" marks the DB chrome ready.
    await page.locator('[aria-label="Add view"]').first().waitFor({ timeout: 20_000 });
  }

  test("sort & filter panels open and apply on an existing database view", async ({ page }) => {
    await openDatabaseSurface(page);
    const sortBtn = page.locator('[aria-label="Sort"]').first();
    const filterBtn = page.locator('[aria-label="Filter"]').first();
    await expect(sortBtn).toBeVisible();

    // SORT — mounts SortPanel (crash site). Panel opens + chrome intact = no blank.
    await sortBtn.click();
    await expect(page.getByText("Sorts", { exact: true })).toBeVisible();
    await expect(filterBtn).toBeVisible();
    // Apply a sort (SortPanel's "Add sort" uses the first property — deterministic).
    await page.getByRole("button", { name: /Add sort/ }).click();
    await expect(page.getByRole("button", { name: /Ascending|Descending/ }).first()).toBeVisible();

    // FILTER — mounts FilterPropertyPicker (the other crash site).
    await filterBtn.click();
    const picker = page.locator(".z-\\[9999\\]").filter({ hasText: "Add filter" });
    await expect(picker).toBeVisible();
    await expect(sortBtn).toBeVisible();
    // Apply a filter on the first property → the persistent filter bar appears.
    await picker.locator("button:has(span.truncate)").first().click();
    await expect(page.locator(".odb-filter-bar")).toBeVisible();
  });
});

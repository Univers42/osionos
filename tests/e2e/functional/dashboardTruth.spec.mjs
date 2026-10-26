/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dashboardTruth.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 08:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 08:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Dashboard numbers match the records they summarize. The Products overview
// showed "Featured Count 300" for a seed with 60 featured products, and the
// command center listed its data sources as "Untitled" chips.

import { test, expect } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

async function openCommandCenter(page) {
  await openFreshPage(page, "/");
  await page.getByText("Workspace command center", { exact: true }).first().click();
}

test.describe("dashboard-truth", () => {
  test("the Featured tile counts the checked products", async ({ page }) => {
    await openCommandCenter(page);
    const entry = page.getByText("Overview Dashboard", { exact: true }).last();
    await entry.scrollIntoViewIfNeeded();
    await entry.click();

    const tile = page.locator("div.p-4", { has: page.getByText("Featured", { exact: true }) }).first();
    await expect(tile).toContainText("60");
    await expect(tile).toContainText("20% of 300 records");
    await expect(page.getByText("Catalog list value", { exact: true })).toBeVisible();
    await expect(page.getByText("Total Revenue", { exact: true })).toHaveCount(0);
  });

  test("the command center names its data sources", async ({ page }) => {
    await openCommandCenter(page);
    const sources = page.locator("div.group", { has: page.getByText("Data sources", { exact: true }) }).first();
    await expect(sources).toContainText("Products");
    await expect(sources).toContainText("Inventory");
    await expect(sources).not.toContainText("Untitled");
  });
});

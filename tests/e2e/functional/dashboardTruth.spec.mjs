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

import { openSeededView } from "../support/seededViews.mjs";

test.describe("dashboard-truth", () => {
  test("the Featured tile counts the checked products", async ({ page }) => {
    await openSeededView(page, "Overview Dashboard");

    const tile = page.locator("div.p-4", { has: page.getByText("Featured", { exact: true }) }).first();
    await expect(tile).toContainText("60");
    await expect(tile).toContainText("20% of 300 records");
    await expect(page.getByText("Catalog list value", { exact: true })).toBeVisible();
    await expect(page.getByText("Total Revenue", { exact: true })).toHaveCount(0);
  });

  // The Home header once listed every demo database as its "data sources" (first as
  // "Untitled" chips): it describes this account now, so it lists none of them.
  test("the Home header names no demo data sources", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-block-type="heading_2"]', { hasText: "Your tasks" }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Data sources", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Featured /view", { exact: true })).toHaveCount(0);
  });

  // A build with no server can never read your account: Home said so only after
  // each block failed a load and logged it (12 console errors, develop CI 40465032837).
  test("Home in a build with no server asks you to connect, and tries no load", async ({ page }) => {
    const loadErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("Load error")) loadErrors.push(message.text());
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Connect to see your tasks.", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-database-id^="sys:"]').getByRole("button", { name: "Retry" })).toHaveCount(0);
    expect(loadErrors).toEqual([]);
  });
});

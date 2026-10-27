/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dashboardOneModel.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import fs from "node:fs";
import { test, expect } from "@playwright/test";

import { openSeededView } from "../support/seededViews.mjs";

const SEED_PATH = "src/shared/notion-database-sys/src/store/dbms/mongodb/_notion_state.json";

function seedCounts() {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
  const pages = Object.values(seed.pages);
  const products = pages.filter((p) => p.databaseId === "db-products");
  const total = products.length;
  const checked = products.filter((p) => p.properties?.["pp-featured"] === true).length;
  return { total, checked };
}

async function openOverviewDashboard(page) {
  await openSeededView(page, "Overview Dashboard");
}

test.describe("dashboard-one-model", () => {
  test.describe.configure({ mode: "serial" });

  test("converted Overview Dashboard renders 10 widgets and Featured counts checked", async ({ page }) => {
    const { total, checked } = seedCounts();
    await openOverviewDashboard(page);

    await expect(page.locator("[data-dash-row]").first()).toBeVisible();
    await expect(page.getByText(/10\/12 widgets/)).toBeVisible();

    // The tile's number is the checked count, not the total.
    await expect(page.getByText(String(checked)).first()).toBeVisible();
    // The provenance states the checked share of all records.
    const share = Math.round((checked / total) * 100);
    await expect(page.getByText(`Count where Featured is checked · ${share}% of ${total} records`)).toBeVisible();
  });

  test("rename persists across reload", async ({ page }) => {
    await openOverviewDashboard(page);
    await page.getByRole("button", { name: /Edit layout/ }).click();
    await page.locator('[aria-label="Widget actions"]').first().click();
    await page.getByText("Rename widget").click();
    const input = page.getByLabel("Widget title");
    await input.fill("Renamed Widget");
    await input.press("Enter");
    await page.getByRole("button", { name: /Done/ }).click();

    await page.reload();
    await openOverviewDashboard(page);
    await expect(page.getByText(/10\/12 widgets/)).toBeVisible();
    await page.getByRole("button", { name: /Edit layout/ }).click();
    await expect(page.getByTitle("Renamed Widget")).toBeVisible();
  });

  test("a dashboard can add Count where Featured is checked from the picker", async ({ page }) => {
    const { checked } = seedCounts();
    await openOverviewDashboard(page);

    // Add a fresh dashboard view through the app's own view tabs, then build a
    // KPI tile on it from the picker (no converted widgets to lean on).
    await page.locator('[aria-label="Add view"]:not([inert] *)').first().click();
    await expect(page.getByText("Add a new view")).toBeVisible();
    await page.getByRole("button", { name: "Dashboard", exact: true }).first().click();
    await page.locator("[data-dash-row]:not([inert] *)").first().waitFor({ timeout: 30_000 });

    await page.getByRole("button", { name: /Edit layout/ }).click();
    await page.getByRole("button", { name: /Add widget/ }).first().click();
    await page.getByText("Count where Featured is checked").first().click();
    await expect(page.getByText(/7\/12 widgets/)).toBeVisible();
    await expect(page.getByText(String(checked)).first()).toBeVisible();
  });

  test("a converted tile's menu has no Embedded view", async ({ page }) => {
    await openOverviewDashboard(page);
    await page.getByRole("button", { name: /Edit layout/ }).click();
    await page.locator('[aria-label="Widget actions"]:not([inert] *)').first().click();
    await expect(page.getByText("Embedded view")).toHaveCount(0);
  });

  test("screenshots", async ({ page }) => {
    test.skip(process.env.DASH_SCREENS !== "1", "DASH_SCREENS not set");
    const { checked, total } = seedCounts();
    void checked; void total;
    for (const width of [1440, 400]) {
      for (const theme of ["light", "dark"]) {
        await page.addInitScript((t) => {
          localStorage.setItem("osionos:theme-mode", t);
        }, theme);
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 860 });
        await openOverviewDashboard(page);
        await page.waitForTimeout(1000);
        await page.screenshot({
          path: `target/screens/dash-one-model-${theme}-${width}.png`,
          fullPage: false,
        });
      }
    }
  });
});

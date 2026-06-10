/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   analyticsDashboards.spec.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*                                                +#+#+#+#+#+   +#+           */
/* ************************************************************************** */

// The dashboard-overhaul wave through the real UI on ?home=database:
// chart-type gallery (ECharts family), Save-chart-as CSV export, the Source
// picker (catalog + rebind), conditional color rules, and widget drag-drop.

import { test, expect } from "@playwright/test";

test.describe("analytics-dashboards-wave", () => {
  test.describe.configure({ mode: "serial" });

  async function openDatabaseSurface(page) {
    await page.goto("/?home=database");
    await page.locator('[aria-label="Add view"]').first().waitFor({ timeout: 20_000 });
  }

  async function addChartOnTheme(page) {
    await page.locator('[aria-label="Add view"]').first().click();
    await expect(page.getByText("Add a new view")).toBeVisible();
    await page.getByRole("button", { name: "Chart", exact: true }).first().click();
    await page.getByRole("button", { name: "Chart", exact: true }).first().click();
    await page.getByText("Edit view", { exact: true }).click();
    await page.getByText("What to show").first().click();
    await page.getByRole("button", { name: /Theme/ }).first().click();
    await expect(page.locator(".recharts-bar-rectangle path").first()).toBeVisible({ timeout: 20_000 });
  }

  async function closeScrim(page) {
    const scrim = page.locator("button.fixed.inset-0");
    if (await scrim.count() > 0) await scrim.first().click({ force: true });
    await expect(scrim).toHaveCount(0);
  }

  test("chart gallery: pick an ECharts preset, the echarts canvas renders", async ({ page }) => {
    await openDatabaseSurface(page);
    await addChartOnTheme(page);

    // Gallery: 50+ presets grouped by family; pick the funnel (no breakdown needed).
    await page.getByRole("menuitem", { name: "Browse all chart types" }).click();
    await expect(page.getByText("All chart types")).toBeVisible();
    await page.getByPlaceholder("Search chart types…").fill("funnel");
    await page.getByRole("button", { name: "Funnel", exact: true }).click();

    // The lazy ECharts chunk loads and renders an SVG canvas.
    const echarts = page.locator('[data-engine="echarts"] svg');
    await expect(echarts.first()).toBeVisible({ timeout: 20_000 });

    // Save chart as… CSV downloads the aggregated data.
    await page.getByText("Save chart as...").click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /CSV data/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test("source picker: catalog lists workspace + demo sources, rebind works", async ({ page }) => {
    await openDatabaseSurface(page);
    await addChartOnTheme(page);

    // The Source row (accessible name "Source <db name>") opens the catalog.
    await page.getByRole("menuitem", { name: /^Source / }).click();
    await expect(page.getByPlaceholder("Search data sources…")).toBeVisible();
    await expect(page.getByText("Demo databases")).toBeVisible();

    // Rebind the chart to the Tasks demo database (name+type remap drops the
    // Theme axis → configure empty state proves the databaseId switched).
    await page.getByPlaceholder("Search data sources…").fill("task");
    await page.getByRole("menuitemradio", { name: /Tasks/ }).click();
    await expect(page.getByRole("menuitem", { name: /^Source Tasks/ })).toBeVisible();
    await closeScrim(page);
  });

  test("conditional color: a rule tints matching table rows", async ({ page }) => {
    await openDatabaseSurface(page);
    // Fresh Table view of the Files DB → settings → Conditional color.
    await page.locator('[aria-label="Add view"]').first().click();
    await expect(page.getByText("Add a new view")).toBeVisible();
    await page.getByRole("button", { name: "Table", exact: true }).first().click();
    await page.getByRole("button", { name: "Table", exact: true }).first().click();
    await page.getByText("Edit view", { exact: true }).click();
    await page.getByRole("menuitem", { name: "Conditional color" }).click();
    await page.getByRole("button", { name: /Add a color rule/ }).click();
    await page.getByRole("button", { name: /Visibility/ }).first().click();
    // Rule editor: `equals` + the first option value, then the green token.
    await expect(page.getByText("Edit color rule")).toBeVisible();
    const search = page.getByPlaceholder("Search for an option...");
    await expect(search).toBeVisible();
    await page.locator('button:below([placeholder="Search for an option..."])').first().click();
    await page.getByRole("button", { name: "Green", exact: true }).click();
    // The table renders behind the panel — at least one row carries the tint.
    await expect(page.locator('tr[style*="background-color"]').first())
      .toBeVisible({ timeout: 10_000 });
  });

  test("dashboard: drag a widget to a new row with the grip handle", async ({ page }) => {
    await openDatabaseSurface(page);
    await page.locator('[aria-label="Add view"]').first().click();
    await page.getByRole("button", { name: "Dashboard", exact: true }).first().click();
    await page.getByRole("button", { name: /Customize layout/ }).click();
    await page.getByRole("button", { name: /Add your first widget/ }).click();
    await page.locator('button:below(:text("Existing views"))').first().click();
    await page.getByRole("button", { name: /Add widget/ }).click();
    await page.locator('button:below(:text("Existing views"))').first().click();
    await expect(page.getByText(/2\/12 widgets/)).toBeVisible();

    // Both widgets share one row; drag the second grip into the gutter below.
    const grips = page.locator('[aria-label="Drag widget"]');
    await expect(grips).toHaveCount(2);
    const grip = grips.last();
    const gripBox = await grip.boundingBox();
    const row = page.locator("[data-dash-row]").first();
    const rowBox = await row.boundingBox();
    expect(gripBox && rowBox).toBeTruthy();
    await page.mouse.move(gripBox.x + 3, gripBox.y + 3);
    await page.mouse.down();
    await page.mouse.move(rowBox.x + rowBox.width / 2, rowBox.y + rowBox.height + 30, { steps: 10 });
    await page.mouse.up();

    // The move committed: two rows now exist.
    await expect(page.locator("[data-dash-row]")).toHaveCount(2);
  });
});

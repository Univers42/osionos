/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   chartDashboardViews.spec.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Notion-parity chart + dashboard views, exercised through the real UI on the
// ?home=database surface (notion-database-sys over the workspace Files DB).

import { test, expect } from "@playwright/test";

test.describe("chart-and-dashboard-views", () => {
  test.describe.configure({ mode: "serial" });

  async function openDatabaseSurface(page) {
    await page.goto("/?home=database");
    // The surface lazy-loads; the "+ Add view" button marks the chrome ready.
    await page.locator('[aria-label="Add view"]').first().waitFor({ timeout: 20_000 });
  }

  async function addViewOfType(page, label) {
    await page.locator('[aria-label="Add view"]').first().click();
    await expect(page.getByText("Add a new view")).toBeVisible();
    await page.getByRole("button", { name: label, exact: true }).first().click();
  }

  test("chart view: configure axes, render, drill down, toggle legend", async ({ page }) => {
    await openDatabaseSurface(page);
    await addViewOfType(page, "Chart");

    // Fresh chart → configure empty state.
    await expect(page.getByText("Configure your chart")).toBeVisible();

    // Open settings: clicking the active "Chart" tab opens its menu.
    await page.getByRole("button", { name: "Chart", exact: true }).first().click();
    await page.getByText("Edit view", { exact: true }).click();
    await expect(page.getByText("Chart type")).toBeVisible();

    // X axis: "What to show" → pick the Theme select property.
    await page.getByText("What to show").first().click();
    await page.getByRole("button", { name: /Theme/ }).first().click();

    // recharts renders bars (lazy chunk loads on demand).
    const bars = page.locator(".recharts-bar-rectangle path");
    await expect(bars.first()).toBeVisible({ timeout: 20_000 });

    // Close the settings panel — its invisible click-away scrim covers the
    // chart and would swallow the bar/legend clicks below.
    const scrim = page.locator("button.fixed.inset-0");
    if (await scrim.count() > 0) await scrim.first().click({ force: true });
    await expect(scrim).toHaveCount(0);

    // Drilldown: click a bar → "N items" popup with the underlying rows.
    await bars.first().click({ force: true });
    await expect(page.getByText(/\d+ items?/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText(/\d+ items?/)).toBeHidden();

    // Legend interaction: clicking an entry hides its group (struck-through).
    const legendButtons = page.locator('button[title="Hide group"]');
    const legendCount = await legendButtons.count();
    expect(legendCount).toBeGreaterThan(0);
    await legendButtons.first().click();
    await expect(page.locator('button[title="Show group"]').first()).toBeVisible();
  });

  test("dashboard view: build widgets, global filter, delete", async ({ page }) => {
    await openDatabaseSurface(page);
    await addViewOfType(page, "Dashboard");

    // Legacy auto-detect renders first, with the upgrade CTA.
    await page.getByRole("button", { name: /Customize layout/ }).click();
    await expect(page.getByText("Build your dashboard")).toBeVisible();

    // First widget: embed an existing view of this database.
    await page.getByRole("button", { name: /Add your first widget/ }).click();
    await expect(page.getByText("Existing views")).toBeVisible();
    const existing = page.locator('div:has(> button) >> text="Existing views"');
    void existing; // section label asserted above; pick the first view row:
    await page.locator('button:below(:text("Existing views"))').first().click();
    await expect(page.getByText(/1\/12 widgets/)).toBeVisible();

    // Second widget: create a NEW chart view inline.
    await page.getByRole("button", { name: /Add widget/ }).click();
    await page.getByText("New view").waitFor();
    await page.locator('button:below(:text("New view"))', { hasText: "Chart" }).first().click();
    await expect(page.getByText(/2\/12 widgets/)).toBeVisible();
    // The fresh chart widget shows its configure empty state inside the frame.
    await expect(page.getByText("Configure your chart")).toBeVisible();

    // Global filter: add a property filter chip — widgets keep rendering.
    await page.getByRole("button", { name: /Filters/ }).click();
    await page.getByRole("button", { name: /Add filter/ }).click();
    await page.getByRole("button", { name: /Theme/ }).first().click();
    await expect(page.getByRole("button", { name: /Filters \(1\)/ })).toBeVisible();
    await expect(page.getByText(/2\/12 widgets/)).toBeVisible();

    // Width resize: drag the divider between the two widgets.
    const splitter = page.locator('[role="separator"][aria-orientation="vertical"]').first();
    if (await splitter.isVisible()) {
      const box = await splitter.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 8 });
        await page.mouse.up();
      }
    }

    // Delete the second widget via its actions menu.
    await page.locator('[aria-label="Widget actions"]').last().click();
    await page.getByText("Delete widget").click();
    await expect(page.getByText(/1\/12 widgets/)).toBeVisible();
  });
});

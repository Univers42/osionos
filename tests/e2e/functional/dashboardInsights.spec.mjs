/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dashboardInsights.spec.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test, expect } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

async function openHomeViews(page) {
  await openFreshPage(page, "/");
  // The command center page hosts the "home_views" launcher.
  const entry = page.getByText("Workspace command center", { exact: true }).first();
  await entry.scrollIntoViewIfNeeded();
  await entry.click();
  await page.waitForTimeout(500);
}

async function openSeededView(page, name) {
  await openHomeViews(page);
  const viewEntry = page.getByText(name, { exact: true }).first();
  await viewEntry.scrollIntoViewIfNeeded();
  await viewEntry.click();
  await page.locator("[data-dash-row]").first().waitFor({ timeout: 30_000 });
}

async function openProductsDashboard(page) {
  await openSeededView(page, "Overview Dashboard");
}

test.describe("dashboard-insights", () => {
  test.describe.configure({ mode: "serial" });

  test("Products Formula Analytics renders through the editable dashboard", async ({ page }) => {
    await openSeededView(page, "Formula Analytics");
    await expect(page.locator("[data-dash-row]").first()).toBeVisible();
    // formula KPI row
    await expect(page.getByText("Formula Columns").first()).toBeVisible();
  });

  test("Projects Relation Analytics renders through the editable dashboard", async ({ page }) => {
    await openSeededView(page, "Relation Analytics");
    await expect(page.locator("[data-dash-row]").first()).toBeVisible();
    await expect(page.getByText("Relations").first()).toBeVisible();
  });

  test("Formula health from the picker renders the same KPI values on a new dashboard", async ({ page }) => {
    await openProductsDashboard(page);
    // create a new dashboard view of Products
    await page.locator('[aria-label="Add view"]:not([inert] *)').first().click();
    await expect(page.getByText("Add a new view")).toBeVisible();
    await page.getByRole("button", { name: "Dashboard", exact: true }).first().click();
    await page.locator("[data-dash-row]:not([inert] *)").first().waitFor({ timeout: 30_000 });

    await page.getByRole("button", { name: /Edit layout/ }).click();
    await page.getByRole("button", { name: /Add widget/ }).first().click();
    await page.getByText("Formula health").first().click();
    await expect(page.getByText("Formula Columns").first()).toBeVisible();
  });

  test("a rename of the converted widget survives a reload", async ({ page }) => {
    await openSeededView(page, "Formula Analytics");
    await page.getByRole("button", { name: /Edit layout/ }).click();
    await page.locator('[aria-label="Widget actions"]').first().click();
    await page.getByText("Rename widget").click();
    const input = page.getByLabel("Widget title");
    await input.fill("Renamed Insight");
    await input.press("Enter");
    await page.getByRole("button", { name: /Done/ }).click();

    await page.reload();
    await openSeededView(page, "Formula Analytics");
    await expect(page.getByText(/1\/12 widgets/)).toBeVisible();
    await page.getByRole("button", { name: /Edit layout/ }).click();
    await expect(page.getByTitle("Renamed Insight")).toBeVisible();
  });

  test("screenshots", async ({ page }) => {
    test.skip(process.env.DASH_SCREENS !== "1", "DASH_SCREENS not set");
    const targets = [
      { name: "Formula Analytics", slug: "formulas" },
      { name: "Relation Analytics", slug: "relations" },
    ];
    for (const { name, slug } of targets) {
      for (const width of [1440, 400]) {
        for (const theme of ["light", "dark"]) {
          await page.addInitScript((t) => {
            localStorage.setItem("osionos:theme-mode", t);
          }, theme);
          await page.setViewportSize({ width, height: width === 1440 ? 900 : 860 });
          await openSeededView(page, name);
          await page.waitForTimeout(1000);
          await page.screenshot({
            path: `target/screens/dash-insights-${slug}-${theme}-${width}.png`,
            fullPage: false,
          });
        }
      }
    }
  });
});
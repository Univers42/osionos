/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsTab.spec.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P1-3b: settings is a workspace tab, not a modal. It opens with one call from
// any surface, focuses instead of duplicating, carries its anchors, is closed
// only by the tab strip, survives a reload as a restored tab, and stacks its
// section strip above the panel when the pane is narrow.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

function settingsTabInStrip(page) {
  return page.locator('[data-osio-tabstrip] [data-tab-id][title="Settings"]');
}

function region(page) {
  return page.getByRole("region", { name: "Settings", exact: true });
}

test.describe("the settings tab", () => {
  test("the rail opens a Settings tab with its region; clicking again focuses, never duplicates", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await page.getByRole("button", { name: "Settings", exact: true }).first().click();

    await expect(settingsTabInStrip(page)).toHaveCount(1);
    await expect(region(page)).toBeVisible();

    await settingsTabInStrip(page).click();
    await expect(settingsTabInStrip(page)).toHaveCount(1);
    await expect(region(page)).toBeVisible();
  });

  test("File menu › Settings opens the same tab", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();

    await expect(settingsTabInStrip(page)).toHaveCount(1);
    await expect(region(page)).toBeVisible();
  });

  test("search 'passkey' + Enter lands on Profile at the Account security anchor", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await page.getByRole("button", { name: "Settings", exact: true }).first().click();
    await region(page).waitFor();

    const search = page.getByRole("searchbox", { name: "Search settings" });
    await search.fill("passkey");
    await search.press("Enter");

    await expect(region(page).getByRole("heading", { name: "Account security" })).toBeVisible();
    await expect(region(page).locator('[data-settings-anchor="account-security"]')).toBeInViewport();
  });

  test("Close Settings removes the region", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await page.getByRole("button", { name: "Settings", exact: true }).first().click();
    await expect(region(page)).toBeVisible();

    await page.getByRole("button", { name: "Close Settings" }).click();
    await expect(region(page)).toHaveCount(0);
  });

  test("a reload restores the tab and renders it with no console error", async ({ page, baseURL }) => {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await openFreshPage(page, baseURL);
    await page.getByRole("button", { name: "Settings", exact: true }).first().click();
    await expect(region(page)).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(region(page)).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("at a phone width the section strip sits above the panel and nothing overflows", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await page.getByRole("button", { name: "Settings", exact: true }).first().click();
    await expect(region(page)).toBeVisible();

    // The tab is arranged at the default viewport: at a phone width the rail's
    // gear sits under the status bar and drops out of the Chromium a11y tree
    // (pre-existing rail behavior, outside this work package's files).
    await page.setViewportSize({ width: 375, height: 812 });

    const strip = page.getByRole("navigation", { name: "Settings sections" });
    const heading = page.getByRole("heading", { level: 1 });
    await expect.poll(async () => Boolean((await strip.boundingBox()) && (await heading.boundingBox()))).toBe(true);
    expect((await heading.boundingBox()).y).toBeGreaterThan((await strip.boundingBox()).y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

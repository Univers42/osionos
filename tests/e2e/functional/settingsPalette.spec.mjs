/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsPalette.spec.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P1-4: settings is one '>' command, one mod+comma, or one ?settings= link
// away — the palette lists the section, the chord opens the tab, and the link
// opens it at its anchor and then drops itself from the URL.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

function settingsRegion(page) {
  return page.getByRole("region", { name: "Settings", exact: true });
}

function paletteInput(page) {
  return page.getByRole("combobox", { name: "Search pages or run a command" });
}

function settingsTabInStrip(page) {
  return page.locator('[data-osio-tabstrip] [data-tab-id][title="Settings"]');
}

test.describe("settings from the palette, the chord and the link", () => {
  test("'>' plus 'notif' lists a Notifications command and Enter opens that section", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await paletteInput(page).fill(">notif");

    const option = page.getByRole("option", { name: /Settings: Notifications/ }).first();
    await expect(option).toBeVisible();

    await paletteInput(page).press("Enter");
    await expect(settingsRegion(page)).toBeVisible();
    await expect(settingsRegion(page).getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
  });

  test("mod+comma opens the settings tab", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    // The chord is taken by the document dispatcher, which ignores keys typed
    // inside the layout grid: focus the top bar (outside it) first.
    await paletteInput(page).click();
    await page.keyboard.press("Control+Comma");

    await expect(settingsTabInStrip(page)).toHaveCount(1);
    await expect(settingsRegion(page)).toBeVisible();
  });

  test("a ?settings= link opens the tab at its anchor and drops itself from the URL", async ({ page, baseURL }) => {
    await page.goto(new URL("/?settings=profile#account-security", baseURL).toString());

    const region = settingsRegion(page);
    await expect(region).toBeVisible();
    await expect(region.getByRole("heading", { name: "Account security" })).toBeVisible();
    await expect(region.locator('[data-settings-anchor="account-security"]')).toBeInViewport();
    await expect.poll(() => page.url()).not.toContain("settings=");
  });

  test("an unknown ?settings= section opens no tab and logs no error", async ({ page, baseURL }) => {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(new URL("/?settings=nope", baseURL).toString());
    // The Home tab in the strip means the layout rendered — the link had its
    // chance to open a tab and did not.
    await expect(page.locator('[data-osio-tabstrip] [data-tab-id][title="Home"]')).toBeVisible();
    await expect(settingsTabInStrip(page)).toHaveCount(0);
    await expect(settingsRegion(page)).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

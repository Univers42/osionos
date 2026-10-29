/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profileEditor.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// Offline Playwright build: VITE_API_URL is empty, so the profile route cannot be
// reached and `page.route` has nothing to intercept. The editor must say so instead
// of drawing a form that cannot save; the save/412/If-Match flow is pinned by the
// store and API unit tests (tests/canvas/account-profile-api.test.ts).

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { closeSettings, openSettings, region, searchSettings } from "../support/settingsHelpers.mjs";

test.describe("public profile editor (offline build)", () => {
  test("says it cannot be edited here, and draws no form", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page);
    await searchSettings(page, "pronouns");

    await expect(region(page).getByRole("heading", { name: "Public profile", exact: true })).toBeVisible();
    await expect(region(page).locator('[data-settings-anchor="public-profile"]')).toBeInViewport();
    await expect(region(page).getByText("Your public profile can't be edited here")).toBeVisible();
    await expect(region(page).getByLabel("Display name")).toHaveCount(0);
    await expect(region(page).getByRole("button", { name: "Save profile" })).toHaveCount(0);

    await closeSettings(page);
  });
});

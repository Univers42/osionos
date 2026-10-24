/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   accountDanger.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Offline Playwright build: no bridge, so the sudo/deletion routes are covered by the
// canvas tests with a stubbed fetch. This spec pins what the browser owns: the flag gate,
// the typed-confirm gate, and that the profile no longer shows rows the server never reported.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { enableAccountDelete } from "../support/accountDelete.mjs";
import { closeSettings, openSettings, region, searchSettings } from "../support/settingsHelpers.mjs";

test.describe("account danger zone (offline build)", () => {
  test("flag off: no delete row, no palette entry", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page);
    await expect(region(page).getByRole("button", { name: "Delete my account", exact: true })).toHaveCount(0);
    await searchSettings(page, "remove account");
    await expect(region(page).locator('[data-settings-anchor="danger"]')).toHaveCount(0);
    await closeSettings(page);
  });

  test("flag on: the typed text gates Schedule deletion", async ({ page, baseURL }) => {
    await enableAccountDelete(page);
    await openFreshPage(page, baseURL);
    await openSettings(page);
    await searchSettings(page, "delete account");
    await region(page).getByRole("button", { name: "Delete my account", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Delete account" });
    const input = dialog.getByRole("textbox");
    const confirmText = await input.getAttribute("placeholder");
    await expect(dialog.getByLabel(`Type ${confirmText} to confirm`)).toBeVisible();
    const action = dialog.getByRole("button", { name: "Schedule deletion" });
    await input.fill(`${confirmText}x`);
    await expect(action).toBeDisabled();
    await input.fill(confirmText ?? "");
    await expect(action).toBeEnabled();
  });

  test("the profile shows no invented rows", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page);
    const profile = region(page);
    await expect(profile.getByText("Passkeys aren't available on this server yet.")).toBeVisible();
    await expect(profile.getByText("Support access")).toHaveCount(0);
    await expect(profile.getByRole("button", { name: "Load more devices" })).toHaveCount(0);
  });
});

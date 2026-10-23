/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sessionsPanel.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Sessions block of Settings → Profile in the offline build, which has no bridge: it must say
// the list is unavailable without inventing a row. The grouped list, Revoke and logout-all run
// against a stubbed bridge in tests/e2e/bridge-stub/sessionsPanel.spec.mjs.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { closeSettings, openSettings, region, searchSettings } from "../support/settingsHelpers.mjs";

test.describe("Sessions block (offline build)", () => {
  test("is there, labelled, and lists nothing it cannot know", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page);
    await searchSettings(page, "sessions");
    const block = region(page).locator('[data-settings-anchor="sessions"]');
    await expect(block.getByRole("heading", { name: "Sessions", exact: true })).toBeVisible();
    await expect(block.getByText("Sessions can't be listed on this server")).toBeVisible();
    await expect(block.getByRole("button", { name: /^Revoke/ })).toHaveCount(0);
    await expect(block.getByRole("button", { name: "Log out of all devices" })).toBeVisible();
    await closeSettings(page);
  });
});

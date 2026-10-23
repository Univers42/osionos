/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settings-ssh-keys.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Settings > Developer > SSH and GPG keys in the offline build, which has no bridge: the
// section must be there and findable, say the list is unavailable instead of inventing a
// row, and not let anyone start adding a key it cannot save. The list, add, delete and
// refusal flows run against a stubbed bridge in tests/e2e/bridge-stub/settingsSshKeys.spec.mjs.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { closeSettings, openSettings, region, searchSettings } from "../support/settingsHelpers.mjs";

test.describe("SSH and GPG keys (offline build)", () => {
  test("is there, labelled, findable by search, and says it cannot load", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "Developer");
    const block = region(page).locator('[data-settings-anchor="ssh-gpg-keys"]');
    await expect(block.getByRole("heading", { name: "SSH and GPG keys", exact: true })).toBeVisible();
    await expect(block.getByRole("alert")).toContainText("Couldn't load these settings");
    await expect(block.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(block.getByRole("button", { name: "Add key" })).toBeDisabled();
    await expect(block.getByRole("row")).toHaveCount(0);
    await searchSettings(page, "fingerprint");
    await expect(region(page).getByRole("heading", { name: "SSH and GPG keys", exact: true })).toBeVisible();
    await closeSettings(page);
  });
});

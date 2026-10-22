/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsHelpers.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The settings screen's e2e helpers, in one place: every settings spec drove
// the same four things through its own copy of them, and a change to the
// settings chrome had to be made in as many files.

import { expect } from "@playwright/test";

/** The settings tab's region; the tab strip owns the closing. exact: the pane's
 *  own "Title bar: Settings" <section> is also role=region by substring. */
export function region(page) {
  return page.getByRole("region", { name: "Settings", exact: true });
}

export function nav(page) {
  return page.getByRole("navigation", { name: "Settings sections" });
}

/**
 * Open one section of the open settings tab and wait for its panel: the
 * selected panel settled, so a later count() never catches a stale panel or
 * the skeleton.
 */
export async function openSection(page, label) {
  const row = nav(page).getByRole("button", { name: label, exact: true });
  await row.click();
  const id = await row.getAttribute("data-settings-section");
  await expect(page.getByRole("heading", { level: 1, name: label, exact: true })).toBeVisible();
  await expect(region(page).locator(`[data-settings-panel="${id}"]`)).toBeVisible();
  return id;
}

/** Open the settings tab, then the named section when one is given. */
export async function openSettings(page, label) {
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await region(page).waitFor();
  if (label) await openSection(page, label);
}

/** Type a query in the settings search box and press Enter. */
export async function searchSettings(page, query) {
  const search = page.getByRole("searchbox", { name: "Search settings" });
  await search.fill(query);
  await search.press("Enter");
}

export async function closeSettings(page) {
  await page.getByRole("button", { name: "Close Settings" }).click();
  await expect(region(page)).toHaveCount(0);
}

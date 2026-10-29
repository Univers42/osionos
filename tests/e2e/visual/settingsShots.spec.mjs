/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsShots.spec.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Screenshots for the design review, not a pixel diff: the committed-PNG
// baselines come from another Chromium than this host's, so the only assertion
// is that no section overflows horizontally. Shots land in target/shots/settings/
// (git-ignored).
// Caveat: scrollWidth misses content clipped by overflow:hidden, so a clipped
// control passes; the shots are what catch that.

import { expect, test } from "@playwright/test";
import { openFreshPage } from "../../browser/core/app.mjs";
import { nav, region } from "../support/settingsHelpers.mjs";

const WIDTHS = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
];
const THEMES = ["light", "dark"];
const OUT = "target/shots/settings";

// The rail renders Settings as a tab on a narrow viewport and a button on a wide one.
async function openSettingsTab(page) {
  await page.getByRole("tab", { name: "Settings", exact: true }).or(page.getByRole("button", { name: "Settings", exact: true })).first().click();
  await region(page).waitFor();
}

function overflowOf(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const settings = document.querySelector('[role="region"][aria-label="Settings"]');
    return {
      page: root.scrollWidth - root.clientWidth,
      region: settings ? settings.scrollWidth - settings.clientWidth : 0,
    };
  });
}

for (const theme of THEMES) {
  for (const { width, height } of WIDTHS) {
    test(`settings sections, ${width}px, ${theme}`, async ({ page, baseURL }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height });
      await page.addInitScript((mode) => localStorage.setItem("osionos:theme-mode", mode), theme);
      await openFreshPage(page, baseURL);
      await openSettingsTab(page);

      // By data-settings-section: a nav row's accessible name can differ from its label (the profile row carries an avatar).
      const ids = await nav(page).locator("[data-settings-section]").evaluateAll((nodes) => nodes.map((node) => node.dataset.settingsSection));
      expect(ids.length, "the nav lists the sections").toBeGreaterThan(10);

      for (const id of ids) {
        await nav(page).locator(`[data-settings-section="${id}"]`).click();
        await expect(region(page).locator(`[data-settings-panel="${id}"]`)).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await region(page).screenshot({ path: `${OUT}/${id}-${width}-${theme}.png` });
        const overflow = await overflowOf(page);
        expect(overflow.page, `${id}: page overflows at ${width}px`).toBeLessThanOrEqual(0);
        expect(overflow.region, `${id}: settings region overflows at ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  }
}

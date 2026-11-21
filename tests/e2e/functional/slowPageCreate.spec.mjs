/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   slowPageCreate.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A page create that resolves after the user switched tab must not replace the tab
// they switched to (#339): the page lands as a background tab and a toast says so.
// Caveat: the 1.5 s delay only has to outlast one tab click; a runner slow enough
// to need longer than that for the click lets the create win and the test fails red.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { giveTheAppABridgeOrigin, seedSession } from "../support/profilePageMocks.mjs";

const CREATE_DELAY_MS = 1_500;

async function delayPageCreate(page) {
  await page.route("**/api/pages", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await new Promise((resolve) => setTimeout(resolve, CREATE_DELAY_MS));
    return route.fallback();
  });
}

test("a slow page create lands as a background tab, not over the tab the user moved to", async ({ page, baseURL }) => {
  await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
  await openFreshPage(page, baseURL);
  await seedSession(page);
  await delayPageCreate(page);
  const untitledTabs = page.locator('[data-tab-id][title="Untitled"]');
  const homeTab = page.locator('[data-tab-id][title="Home"]');
  await expect(untitledTabs).toHaveCount(1);

  const created = page.waitForResponse((response) => response.url().endsWith("/api/pages") && response.request().method() === "POST");
  await page.getByRole("button", { name: /New page/i }).first().click();
  await homeTab.click();
  await expect(homeTab).toHaveAttribute("data-active", "");
  await created;

  // The new tab and its focus land in one render, so once two tabs show, a takeover has happened.
  await expect(untitledTabs).toHaveCount(2);
  await expect(homeTab).toHaveAttribute("data-active", "");
  await expect(untitledTabs.and(page.locator("[data-active]"))).toHaveCount(0);
  const toast = page.getByRole("status").filter({ hasText: "Page created" });
  await expect(toast).toBeVisible();

  await toast.getByRole("button", { name: "Open", exact: true }).click();
  await expect(untitledTabs.and(page.locator("[data-active]"))).toHaveCount(1);
  await expect(homeTab).not.toHaveAttribute("data-active", "");
});

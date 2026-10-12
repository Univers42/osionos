/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workbenchTitleBar.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// osio.workbench: the page chrome (breadcrumbs / share / favourite / tools) lives in ONE
// per-pane EditorTitleBar; with the flag off it stays inside the page, as before.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const TITLE_BAR = "[data-osio-editor-titlebar]";

async function openPage(page, baseURL, workbench) {
  if (workbench) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("osio.workbench", "1");
      } catch {
        /* ignore */
      }
    });
  }
  await openFreshPage(page, baseURL);
  await page.locator(".osionos-page").first().waitFor({ state: "visible", timeout: 20_000 });
}

test("workbench on: one title bar per pane, none inside the page", async ({ page, baseURL }) => {
  await openPage(page, baseURL, true);

  const bars = page.locator(TITLE_BAR);
  await expect(bars).toHaveCount(await page.locator("[data-osio-pane]").count());
  await expect(bars.first().getByRole("navigation", { name: "Page breadcrumbs" })).toBeVisible();
  await expect(bars.first().getByRole("button", { name: "Open page configuration" })).toBeVisible();
  await expect(page.getByRole("region", { name: /^Title bar:/ }).first()).toBeVisible();

  await expect(page.locator(".osionos-page").getByRole("navigation", { name: "Page breadcrumbs" })).toHaveCount(0);
  // Exactly one bar per pane overall: the page did not keep a second copy.
  await expect(page.getByRole("navigation", { name: "Page breadcrumbs" })).toHaveCount(
    await page.locator("[data-osio-pane]").count(),
  );
  await expect(page.locator(".osionos-page").getByRole("button", { name: "Open page configuration" })).toHaveCount(0);
});

test("workbench off: the bar is inside the page, no title bar", async ({ page, baseURL }) => {
  await openPage(page, baseURL, false);

  await expect(page.locator(TITLE_BAR)).toHaveCount(0);
  await expect(page.locator(".osionos-page").getByRole("navigation", { name: "Page breadcrumbs" })).toHaveCount(1);
  await expect(page.getByRole("region", { name: /^Title bar:/ })).toHaveCount(0);
});

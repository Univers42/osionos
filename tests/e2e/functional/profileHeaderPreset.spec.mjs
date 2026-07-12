/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profileHeaderPreset.spec.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// "/header" → a linked "Profile header" page: an ambient VIDEO cover backdrops
// the header BAND (a layoutRole="header" canvas of glass cells with live
// database views) while the rest of the page stays a normal page below.

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  openSlashMenuFromEditor,
  slashCommandEntry,
} from "../../browser/core/app.mjs";

test("slash /header creates a glass header-canvas page over a video cover", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await openSlashMenuFromEditor(editor, "/header");
  await slashCommandEntry(page, "Profile header").click();

  // The preset opens the created page: header-band mode = cover + header-role canvas.
  await expect(page.locator(".osionos-page--header-band")).toBeVisible({ timeout: 15_000 });

  // Video cover attached (offline env: the element exists; the asset itself is remote).
  await expect(page.locator('[data-testid="page-cover-video"]')).toHaveCount(1);

  // Glass cells float over the backdrop.
  const glassCells = page.locator(".osionos-layout-cell--glass");
  await expect(glassCells.first()).toBeVisible();
  expect(await glassCells.count()).toBeGreaterThanOrEqual(4);

  // Live database views are mounted inside the header cells.
  await expect(page.locator(".osionos-layout-cell--glass .osionos-database-block").first()).toBeAttached({ timeout: 15_000 });
});

test("Customize header adds a band, keeps the page, and toggles focus", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("Body text stays put");

  await page.getByRole("button", { name: /^Customize header$/ }).click();

  // Band mode: cover video backdrop + glass hero cells, page content intact below.
  await expect(page.locator(".osionos-page--header-band")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="page-cover-video"]')).toHaveCount(1);
  expect(await page.locator(".osionos-layout-cell--glass").count()).toBeGreaterThanOrEqual(4);
  await expect(page.getByText("Body text stays put")).toBeVisible();

  // Focus toggle: inserting opens edit mode ("Done editing header"), clicking returns to normal sight.
  const doneButton = page.getByRole("button", { name: /Done editing header/ });
  await expect(doneButton).toBeVisible();
  // The page auto-scrolls during insert; surface the toolbar from under the sticky breadcrumbs bar.
  await page.locator(".osionos-page").first().evaluate((el) => el.scrollTo(0, 0));
  await doneButton.click();
  await expect(page.getByRole("button", { name: /^Customize header$/ })).toBeVisible();
  await expect(page.locator(".osionos-page--header-band")).toBeVisible();
  await expect(page.getByText("Body text stays put")).toBeVisible();
});

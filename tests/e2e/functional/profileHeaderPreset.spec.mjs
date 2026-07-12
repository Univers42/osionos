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

// "/header" → a linked "Profile header" page: ambient VIDEO cover as a
// full-bleed backdrop (header-canvas mode) with glass layout cells floating
// over it, wired to live database views (chart + timeline).

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

  // The preset opens the created page: header-canvas mode = cover + full-page canvas.
  const headerCanvasPage = page.locator(".osionos-page--header-canvas");
  await expect(headerCanvasPage).toBeVisible({ timeout: 15_000 });

  // Video cover attached (offline env: the element exists; the asset itself is remote).
  await expect(page.locator('[data-testid="page-cover-video"]')).toHaveCount(1);

  // Glass cells float over the backdrop.
  const glassCells = page.locator(".osionos-layout-cell--glass");
  await expect(glassCells.first()).toBeVisible();
  expect(await glassCells.count()).toBeGreaterThanOrEqual(4);

  // Live database views are mounted inside the header cells.
  await expect(page.locator(".osionos-layout-cell--glass .osionos-database-block").first()).toBeAttached({ timeout: 15_000 });
});

test("Customize header button transforms the current page in place", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  await page.getByRole("button", { name: /Customize header/i }).click();

  await expect(page.locator(".osionos-page--header-canvas")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="page-cover-video"]')).toHaveCount(1);
  expect(await page.locator(".osionos-layout-cell--glass").count()).toBeGreaterThanOrEqual(4);
  // The button retires once the page is a header canvas.
  await expect(page.getByRole("button", { name: /Customize header/i })).toHaveCount(0);
});

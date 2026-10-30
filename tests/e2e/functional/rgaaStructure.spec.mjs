/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   rgaaStructure.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The RGAA criteria the manual pass found failing and axe cannot see (#224): a skip link
// (12.7), a window title that names the open document (8.6), a page heading (9.1) and one
// main landmark with named, distinct navigation landmarks (12.6 / 9.2).

import { expect, test } from "@playwright/test";

import { openFreshPage, pageTitleEditor } from "../../browser/core/app.mjs";

test.describe("RGAA structure", () => {
  test("the first Tab stop skips past the chrome to the main content", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    // A fresh load, as a visitor arrives: a blur would keep Chrome's Tab start point on the title.
    await page.reload();
    await expect(pageTitleEditor(page)).toBeVisible();
    await page.keyboard.press("Tab");

    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath("skip-link.png"), clip: { x: 0, y: 0, width: 480, height: 120 } });

    await page.keyboard.press("Enter");
    await expect(page.locator("main#osio-main")).toBeFocused();
  });

  test("the window title follows the open page and its renames", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const title = pageTitleEditor(page);
    await title.fill("Quarterly plan");
    await expect(page).toHaveTitle("Quarterly plan — osionos");

    await title.fill("Quarterly plan v2");
    await expect(page).toHaveTitle("Quarterly plan v2 — osionos");
  });

  test("an open page has one level-1 heading named after it, and one main landmark", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await pageTitleEditor(page).fill("Reading list");

    await expect(page.getByRole("heading", { level: 1, name: "Reading list" })).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
  });

  test("every navigation landmark has its own name", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const names = await page.getByRole("navigation").evaluateAll((navs) =>
      navs.filter((nav) => nav.getClientRects().length > 0).map((nav) => nav.getAttribute("aria-label") ?? ""));
    expect(names.length).toBeGreaterThan(1);
    expect(names.filter((name) => !name)).toEqual([]);
    expect(new Set(names).size).toBe(names.length);
  });
});

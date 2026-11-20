/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageShells.spec.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The "/" page shells in the browser: a two-sidebar shell keeps its sidebars
// sticky on a wide screen and stacks every region in reading order on a phone
// without widening the page. Regions apply to the read-only grid, so the page
// is switched to view mode before measuring.

/* global localStorage, getComputedStyle */

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage, slashCommandEntry } from "../../browser/core/app.mjs";

const REGIONS = ["header", "main", "left", "right", "footer"];
const regionCell = (page, region) => page.locator(`.osionos-layout-grid[data-has-regions="true"] > [data-region="${region}"]`);

async function insertTwoSidebarsAndView(page, baseURL) {
  await page.addInitScript(() => localStorage.setItem("osio.layout.modes", "1"));
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.pressSequentially("/two sidebars");
  await expect(slashCommandEntry(page, "Two sidebars")).toBeVisible();
  await page.keyboard.press("Enter");
  const editButton = page.locator("button[aria-pressed]", { hasText: "Edit" });
  await editButton.click();
  await expect(editButton).toHaveAttribute("aria-pressed", "false");
  for (const region of REGIONS) await expect(regionCell(page, region)).toHaveCount(1);
}

test("with osio.layout.modes off the slash menu offers no page shell", async ({ page, baseURL }) => {
  await page.addInitScript(() => localStorage.removeItem("osio.layout.modes"));
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.pressSequentially("/two sidebars");
  await expect(slashCommandEntry(page, "Two sidebars")).toHaveCount(0);
});

test("at 1440x900 the two-sidebar shell keeps its sidebars sticky", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await insertTwoSidebarsAndView(page, baseURL);
  for (const region of ["left", "right"]) {
    expect(await regionCell(page, region).evaluate((node) => getComputedStyle(node).position)).toBe("sticky");
  }
});

test("at 400x800 every region stacks in reading order and nothing overflows", async ({ page, baseURL }) => {
  await insertTwoSidebarsAndView(page, baseURL);
  await page.setViewportSize({ width: 400, height: 800 });
  await expect.poll(() => regionCell(page, "left").evaluate((node) => getComputedStyle(node).position)).toBe("relative");
  const boxes = [];
  for (const region of REGIONS) boxes.push(await regionCell(page, region).boundingBox());
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index].y, `${REGIONS[index]} below ${REGIONS[index - 1]}`).toBeGreaterThanOrEqual(boxes[index - 1].y + boxes[index - 1].height - 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
});

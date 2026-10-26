/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseLayering.spec.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A database view's sticky chrome (the table's header row and calculation bar,
// the timeline's day header) carries z-indices for the view's own layering.
// With no stacking context of their own they competed with the page: the menus
// that drop from the page header bar, and the outline rail, sit at a lower
// layer, so those bars cut straight through them.

import { test, expect } from "@playwright/test";

import { addPropertyOfType, addView, insertInlineDatabase } from "../support/databaseHelpers.mjs";

async function databaseWithRows(page) {
  await page.setViewportSize({ width: 1280, height: 600 });
  const block = await insertInlineDatabase(page);
  await expect(block.getByText("Untitled Database").first()).toBeVisible({ timeout: 15_000 });
  for (let i = 0; i < 2; i++) await block.getByRole("button", { name: "New", exact: true }).last().click();
  await expect(block.locator("tbody tr").filter({ hasText: "Empty" })).toHaveCount(3);
  return block;
}

/** Scroll the page so the view's sticky `bar` sits just under the page header
 *  bar, open the page configuration menu over it, and list what paints over the menu. */
async function menuOverView(page, block, bar) {
  await block.evaluate((el, selector) => {
    const scroller = el.closest(".osionos-page");
    const header = document.querySelector('button[aria-label="Open page configuration"]').closest(".sticky");
    scroller.scrollTop += el.querySelector(selector).getBoundingClientRect().top - header.getBoundingClientRect().bottom - 20;
  }, bar);
  await page.getByRole("button", { name: "Open page configuration" }).click();
  const menu = page.getByTestId("page-config-menu");
  await expect(menu).toBeVisible();
  return menu.evaluate((el, selector) => {
    const r = el.getBoundingClientRect();
    const target = document.querySelector(`.osionos-database-block ${selector}`).getBoundingClientRect();
    const lost = [];
    for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) {
      const x = r.left + (r.width * i) / 10, y = r.top + (r.height * j) / 10;
      if (y > innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      // Only the database is under test; the app's floating chat button may cover the menu's tail.
      if (hit?.closest(".osionos-database-block")) lost.push(hit.closest("thead, tfoot, tbody, .sticky")?.tagName ?? hit.tagName);
    }
    return { crossesBar: r.top < target.bottom && r.bottom > target.top && r.left < target.right, lost };
  }, bar);
}

test.describe("database-layering", () => {
  test("the page menu paints over the table's header row and calculation bar", async ({ page }) => {
    const block = await databaseWithRows(page);
    const result = await menuOverView(page, block, "thead");
    expect(result.crossesBar, "the menu drops over the table header").toBe(true);
    expect(result.lost).toEqual([]);
  });

  test("the page menu paints over the timeline's day header", async ({ page }) => {
    const block = await databaseWithRows(page);
    await addPropertyOfType(block, page, "Date", "Due");
    await addView(block, page, "Timeline");
    const result = await menuOverView(page, block, ".sticky.top-0");
    expect(result.crossesBar, "the menu drops over the timeline header").toBe(true);
    expect(result.lost).toEqual([]);
  });
});

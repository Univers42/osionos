/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseToolsUx.spec.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The inline database toolbar and its search. At phone width the toolbar used
// to float off the left edge (Filter, Sort and Search unreachable); the search
// gave no feedback on what it matched and one Escape threw the query away.

import { test, expect } from "@playwright/test";

import { fillCell, insertInlineDatabase } from "../support/databaseHelpers.mjs";

async function tableNamed(page, names) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const block = await insertInlineDatabase(page);
  await expect(block.getByText("Untitled Database").first()).toBeVisible({ timeout: 15_000 });
  for (let i = 1; i < names.length; i++) await block.getByRole("button", { name: "New", exact: true }).last().click();
  for (const [row, name] of names.entries()) await fillCell(page, block, row, 0, name);
  return block;
}

async function openSearch(block) {
  await block.hover();
  await block.getByRole("button", { name: "Search", exact: true }).click();
  const input = block.getByRole("searchbox", { name: "Search database" });
  await expect(input).toBeFocused();
  return input;
}

/** Whether the element paints a focus frame (an outline or a ring shadow). */
function hasFrame(locator) {
  return locator.evaluate((node) => {
    const cs = getComputedStyle(node);
    return (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
  });
}

const dataRows = (block) => block.locator("tbody tr").filter({ has: block.page().locator("td") }).filter({ hasNotText: /^\s*New\s*$/ });

test.describe("database-tools-ux", () => {
  test("at phone width the toolbar stays on screen and every tool opens", async ({ page }) => {
    const block = await tableNamed(page, ["Alpha"]);
    await page.setViewportSize({ width: 400, height: 800 });
    await block.locator("tbody td").first().click();
    for (const name of ["Filter", "Sort", "Search"]) {
      const button = block.getByRole("button", { name, exact: true });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box.x, `${name} left edge`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${name} right edge`).toBeLessThanOrEqual(400);
    }
    const input = await openSearch(block);
    const box = await input.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("search says how many rows match; Escape clears first, then closes", async ({ page }) => {
    const block = await tableNamed(page, ["Alpha", "Beta", "Gamma"]);
    const input = await openSearch(block);
    const status = block.getByRole("search").getByRole("status");

    await input.fill("al");
    await expect(status).toHaveText("1 match");
    await expect(dataRows(block)).toHaveCount(1);
    await input.fill("zzz");
    await expect(status).toHaveText("No matches");

    await input.press("Escape");
    await expect(input).toHaveValue("");
    await expect(input).toBeFocused();
    await expect(dataRows(block)).toHaveCount(3);
    await input.press("Escape");
    await expect(input).toHaveCount(0);
    await expect(block.getByRole("button", { name: "Search", exact: true })).toBeFocused();
  });

  test("the search row draws one focus frame and leaves the toolbar and title in place", async ({ page }) => {
    const block = await tableNamed(page, ["Alpha"]);
    await block.hover();
    const actions = block.locator(".odb-topbar-actions");
    const before = await actions.boundingBox();
    const input = await openSearch(block);
    expect(await hasFrame(input), "the input draws no frame of its own").toBe(false);
    expect(await hasFrame(block.getByRole("search")), "the search row shows focus").toBe(true);

    const after = await actions.boundingBox();
    expect(Math.round(after.x), "the toolbar did not grow over the title").toBe(Math.round(before.x));
    const title = block.locator("[data-database-title], h1, h2").filter({ hasText: "Untitled Database" }).first();
    const t = await title.boundingBox();
    expect(t.x + t.width, "title clear of the toolbar").toBeLessThanOrEqual(after.x + 1);
  });
});

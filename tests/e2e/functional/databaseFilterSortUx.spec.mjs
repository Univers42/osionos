/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseFilterSortUx.spec.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Filter and sort, from the toolbar of an inline database. Picking a filter
// property used to add an empty rule and stop there; the bar then showed a
// "1 rule" pill beside a bare "Name" chip. The property picker was placed once
// and stayed put when the page scrolled, and the advanced filter was pinned to
// the middle of the window at 520px, wider than a phone. Choosing an operator
// closed the editor it was chosen from. "Add sort" quietly sorted by the first
// property, picked from a native <select>.

import { test, expect } from "@playwright/test";

import { dataRows, hasFrame, insertNamedTable } from "../support/databaseHelpers.mjs";

async function openFilterPicker(page, block) {
  await block.hover();
  await block.getByRole("button", { name: "Filter", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Add filter" });
  await expect(picker).toBeVisible();
  return picker;
}

test.describe("database-filter-sort-ux", () => {
  test("picking a filter property opens its value; the chip says what it filters", async ({ page }) => {
    const block = await insertNamedTable(page, ["Alpha", "Beta", "Gamma"]);
    const picker = await openFilterPicker(page, block);
    await picker.getByRole("button", { name: "Name", exact: true }).click();

    const value = page.getByRole("textbox", { name: "Filter value" });
    await expect(value).toBeFocused();
    const chip = block.locator(".odb-filter-bar").getByRole("button", { name: /^Name/ });
    const [chipBox, valueBox] = [await chip.boundingBox(), await value.boundingBox()];
    expect(valueBox.y, "the editor hangs under its chip, off the title").toBeGreaterThan(chipBox.y + chipBox.height);
    await value.fill("al");
    await expect(dataRows(block)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(value, "Escape closes the editor").toHaveCount(0);
    await expect(chip).toBeFocused();

    const bar = block.locator(".odb-filter-bar");
    await expect(bar.getByRole("button", { name: /Name contains al/ })).toBeVisible();
    await expect(bar.getByText(/^\d+ rules?$/)).toHaveCount(0);
  });

  test("the property picker draws one focus frame and follows its button", async ({ page }) => {
    const block = await insertNamedTable(page, ["Alpha"]);
    const picker = await openFilterPicker(page, block);
    const search = picker.getByRole("textbox", { name: "Filter by property" });
    await expect(search).toBeFocused();
    expect(await hasFrame(search), "the field draws no frame of its own").toBe(false);
    expect(await hasFrame(search.locator("..")), "its box shows focus").toBe(true);

    const gap = () => page.evaluate(() => {
      const button = [...document.querySelectorAll('button[aria-label="Filter"]')].find((b) => b.getBoundingClientRect().width > 0);
      const dialog = document.querySelector('dialog[open][aria-label="Add filter"]');
      return Math.round(dialog.getBoundingClientRect().top - button.getBoundingClientRect().bottom);
    });
    const before = await gap();
    await block.evaluate((el) => { el.closest(".osionos-page").scrollTop += 60; });
    await expect.poll(gap).toBe(before);
  });

  test("the advanced filter opens beside its button and fits a phone", async ({ page }) => {
    const block = await insertNamedTable(page, ["Alpha"]);
    await page.setViewportSize({ width: 400, height: 800 });
    await block.locator("tbody td").first().click();
    const picker = await openFilterPicker(page, block);
    await picker.getByRole("button", { name: "Add advanced filter" }).click();
    const advanced = page.getByRole("dialog", { name: "Advanced filter" });
    await expect(advanced).toBeVisible();
    const box = await advanced.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("the operator menu changes the rule without closing its editor", async ({ page }) => {
    const block = await insertNamedTable(page, ["Alpha", "Beta", "Gamma"]);
    const picker = await openFilterPicker(page, block);
    await picker.getByRole("button", { name: "Name", exact: true }).click();
    await page.getByRole("textbox", { name: "Filter value" }).fill("al");
    await expect(dataRows(block)).toHaveCount(1);

    await page.getByRole("button", { name: "Operator: contains" }).click();
    await page.getByRole("button", { name: "Does not contain", exact: true }).click();
    await expect(dataRows(block)).toHaveCount(2);
    await expect(page.getByRole("textbox", { name: "Filter value" })).toHaveValue("al");
    await expect(block.locator(".odb-filter-bar").getByRole("button", { name: /Name does not contain al/ })).toBeVisible();
  });

  test("Sort asks which property first, from a searchable list rather than a native select", async ({ page }) => {
    const block = await insertNamedTable(page, ["Beta", "Alpha"]);
    await block.hover();
    await block.getByRole("button", { name: "Sort", exact: true }).click();
    const sort = page.getByRole("dialog", { name: "Sort" });
    await expect(sort.getByRole("textbox", { name: "Sort by property" })).toBeFocused();
    await expect(dataRows(block).first()).toContainText("Beta");

    await sort.getByRole("button", { name: "Name", exact: true }).click();
    await expect(dataRows(block).first()).toContainText("Alpha");
    await expect(sort.locator("select")).toHaveCount(0);
    await expect(sort.getByRole("button", { name: "Sort by Name", exact: true })).toBeVisible();
    await expect(sort.getByRole("button", { name: "Direction: Ascending" })).toBeVisible();
  });
});

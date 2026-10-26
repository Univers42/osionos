/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseEditAffordance.spec.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// What a value looks like before and while you change it. A card value is an
// editor behind a click, but it hovered with a near-invisible tint under the
// card's grab cursor, so nothing said "this changes". In the table, a selected
// cell and an edited one looked the same, and a double-click flashed a text
// selection over the value before the editor opened.

import { test, expect } from "@playwright/test";

import { addPropertyOfType, addView, fillCell, insertInlineDatabase } from "../support/databaseHelpers.mjs";

async function tableWithNotes(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const block = await insertInlineDatabase(page);
  await expect(block.getByText("Untitled Database").first()).toBeVisible({ timeout: 15_000 });
  await addPropertyOfType(block, page, "Text", "Notes");
  const headers = await block.locator("thead th").allTextContents();
  const column = headers.findIndex((header) => header.includes("Notes"));
  await fillCell(page, block, 0, column, "hello world");
  return { block, notes: block.locator("tbody tr").first().locator("td").nth(column) };
}

const paint = (locator) => locator.evaluate((el) => {
  const style = getComputedStyle(el);
  return { cursor: style.cursor, background: style.backgroundColor, ring: style.boxShadow };
});

test.describe("database-edit-affordance", () => {
  test("a card value shows it can be changed on hover, and frames its editor", async ({ page }) => {
    const { block } = await tableWithNotes(page);
    await addView(block, page, "Gallery");
    const value = block.getByRole("button", { name: "Edit Notes" });
    await expect(value).toBeVisible();
    // The hover padding must not eat into the value: "hello world" fits whole.
    expect(await value.locator("span").first().evaluate((text) => text.scrollWidth <= text.clientWidth)).toBe(true);

    await page.mouse.move(0, 0);
    const resting = await paint(value);
    await value.hover();
    await expect.poll(async () => (await paint(value)).background).not.toBe(resting.background);
    expect((await paint(value)).cursor).toBe("pointer");

    await value.click();
    const editor = block.locator("[data-cell-anchor] textarea, [data-cell-anchor] input").first();
    await expect(editor).toBeFocused();
    const frame = editor.locator("xpath=ancestor::*[@data-cell-anchor][1]");
    expect((await paint(frame)).ring, "the card editor has a visible frame").not.toBe("none");
  });

  test("an edited cell looks different from a selected one, and a double-click selects no text", async ({ page }) => {
    const { notes } = await tableWithNotes(page);
    // Enter committed the value and left the cell selected, not editing.
    await expect(notes).toHaveAttribute("aria-selected", "true");
    await expect(notes.locator("textarea, input")).toHaveCount(0);
    const selected = await paint(notes);

    await page.mouse.click(10, 10);
    await page.evaluate(() => {
      window.__strayText = [];
      document.addEventListener("selectionchange", () => {
        const text = String(getSelection());
        const inField = document.activeElement?.matches("input, textarea");
        if (text && !inField) window.__strayText.push(text);
      });
    });
    await notes.dblclick();
    await expect(notes.locator("textarea, input").first()).toBeFocused();
    expect(await page.evaluate(() => window.__strayText)).toEqual([]);
    expect((await paint(notes)).background, "editing drops the selection tint").not.toBe(selected.background);
  });
});

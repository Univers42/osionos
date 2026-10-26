/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseCellEnter.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Enter that commits a cell edit belongs to the table: the cell stays selected
// and the next key acts on the grid. It used to fall through to the page editor
// around the database, so the caret landed in a page paragraph and the next
// keys were typed into the page.

import { test, expect } from "@playwright/test";

import { addPropertyOfType, insertInlineDatabase } from "../support/databaseHelpers.mjs";

/** The grid container that owns DOM focus while a cell is selected. */
function grid(block) {
  return block.locator("[aria-activedescendant]").first();
}

function cellIn(block, headers, name, row = 0) {
  const index = headers.findIndex((header) => header.includes(name));
  return block.locator("tbody tr").nth(row).locator("td").nth(index);
}

async function focusState(page) {
  return page.evaluate(() => {
    const block = document.querySelector(".osionos-database-block--inline");
    const active = document.activeElement;
    return {
      inDatabase: Boolean(active && block?.contains(active)),
      editing: block ? block.querySelectorAll("tbody input, tbody textarea").length : -1,
      selected: block?.querySelector("[aria-activedescendant]")?.getAttribute("aria-activedescendant") ?? null,
    };
  });
}

async function expectSelectedNotEditing(page, selectedId) {
  await expect.poll(() => focusState(page)).toEqual({ inDatabase: true, editing: 0, selected: selectedId });
}

async function freshTable(page) {
  const block = await insertInlineDatabase(page);
  // The host-minted database materializes after the block mounts; a click
  // before that lands on a placeholder and selects nothing.
  await expect(block.getByText("Untitled Database").first()).toBeVisible({ timeout: 10_000 });
  await block.hover();
  return block;
}

/** Click a cell until the grid reports it selected; returns its descendant id. */
async function selectCell(block, cell) {
  await cell.click();
  await expect(grid(block)).toHaveAttribute("aria-activedescendant", /odb-cell:/);
  return grid(block).getAttribute("aria-activedescendant");
}

test.describe("database-cell-enter", () => {
  test("Enter commits the Name cell and keeps it selected; typing stays out of the page", async ({ page }) => {
    const block = await freshTable(page);
    const headers = await block.locator("thead th").allTextContents();
    const name = cellIn(block, headers, "Name");

    const selectedId = await selectCell(block, name);
    await page.keyboard.press("Enter");
    await name.locator("input, textarea").first().waitFor();
    await page.keyboard.type("Alpha");
    await page.keyboard.press("Enter");

    await expect(name).toContainText("Alpha");
    await expectSelectedNotEditing(page, selectedId);
    const paragraphs = page.locator('[data-block-type="paragraph"]');
    const before = await paragraphs.allTextContents();
    await page.keyboard.type("x");
    expect(await paragraphs.allTextContents()).toEqual(before);
  });

  test("type-to-edit in the Name cell commits on Enter the same way", async ({ page }) => {
    const block = await freshTable(page);
    const headers = await block.locator("thead th").allTextContents();
    const name = cellIn(block, headers, "Name");

    const selectedId = await selectCell(block, name);
    await page.keyboard.type("Gamma");
    await page.keyboard.press("Enter");

    await expect(name).toContainText("Gamma");
    await expectSelectedNotEditing(page, selectedId);
  });

  test("number and URL cells keep the selection after Enter", async ({ page }) => {
    const block = await freshTable(page);
    await addPropertyOfType(block, page, "Number", "Score");
    await addPropertyOfType(block, page, "URL", "Link");
    const headers = await block.locator("thead th").allTextContents();

    for (const [column, value] of [["Score", "42"], ["Link", "example.org"]]) {
      const cell = cellIn(block, headers, column);
      const selectedId = await selectCell(block, cell);
      await page.keyboard.press("Enter");
      await cell.locator("input, textarea").first().waitFor();
      await page.keyboard.type(value);
      await page.keyboard.press("Enter");
      await expect(cell).toContainText(value);
      await expectSelectedNotEditing(page, selectedId);
    }
  });

  test("after a commit, Enter reopens the same cell and ArrowDown moves to the next row", async ({ page }) => {
    const block = await freshTable(page);
    await block.getByRole("button", { name: "New", exact: true }).last().click();
    const headers = await block.locator("thead th").allTextContents();
    const name = cellIn(block, headers, "Name");

    const selectedId = await selectCell(block, name);
    await page.keyboard.press("Enter");
    await page.keyboard.type("Row one");
    await page.keyboard.press("Enter");
    await expectSelectedNotEditing(page, selectedId);

    await page.keyboard.press("Enter");
    await expect(name.locator("input, textarea").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expectSelectedNotEditing(page, selectedId);

    await page.keyboard.press("ArrowDown");
    const nextId = await grid(block).getAttribute("aria-activedescendant");
    expect(nextId).not.toBe(selectedId);
    expect(nextId).toContain("title");
  });

  test("Shift+Enter writes a second line in the Name cell; Enter commits both", async ({ page }) => {
    const block = await freshTable(page);
    const headers = await block.locator("thead th").allTextContents();
    const name = cellIn(block, headers, "Name");

    const selectedId = await selectCell(block, name);
    await page.keyboard.press("Enter");
    await name.locator("input, textarea").first().waitFor();
    await page.keyboard.type("first");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("second");
    await expect(name.locator("textarea")).toHaveValue("first\nsecond");
    await page.keyboard.press("Enter");

    expect(await name.textContent()).toContain("first\nsecond");
    await expectSelectedNotEditing(page, selectedId);
  });
  test("a two-line Name keeps its line break on the record page, where Shift+Enter adds another", async ({ page }) => {
    const block = await freshTable(page);
    const headers = await block.locator("thead th").allTextContents();
    const name = cellIn(block, headers, "Name");

    await selectCell(block, name);
    await page.keyboard.press("Enter");
    await page.keyboard.type("first");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("second");
    await page.keyboard.press("Enter");
    await name.hover();
    await name.getByText("OPEN").click();

    // The record page lists Name as an editable property; a one-line <input>
    // drops the "\n" from its value, and an edit there saved the merged text.
    const field = page.getByRole("textbox", { name: "Name", exact: true });
    await expect(field).toHaveValue("first\nsecond");
    await field.click();
    await field.press("End");
    await field.press("Shift+Enter");
    await field.pressSequentially("third");
    await expect(field).toHaveValue("first\nsecond\nthird");
    await field.press("Enter");
    await expect(field).not.toBeFocused();
    await expect(field).toHaveValue("first\nsecond\nthird");
  });
});

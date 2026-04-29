/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tableCellEditing.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: codex <codex@openai.com>                   +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/29 00:00:00 by codex             #+#    #+#             */
/*   Updated: 2026/04/29 00:00:00 by codex            ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  openSidebarPage,
  primeLocalState,
  tableCell,
  tableCells,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

async function openFreshTable(page, appUrl) {
  await primeLocalState(page, {
    activeUserId: "mock-user-0",
    activeWorkspaceByUser: {
      "mock-user-0": "mock-ws-private-0",
    },
    pages: {
      "mock-ws-private-0": [
        {
          _id: "table-fixture-page",
          title: "Table Fixture Page",
          workspaceId: "mock-ws-private-0",
          ownerId: "mock-user-0",
          visibility: "private",
          collaborators: [],
          parentPageId: null,
          databaseId: null,
          archivedAt: null,
          content: [
            {
              id: "table-fixture-block",
              type: "table_block",
              content: "",
              tableData: [
                ["", "", ""],
                ["", "", ""],
                ["", "", ""],
              ],
            },
          ],
        },
      ],
    },
  });
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await openSidebarPage(page, "table-fixture-page");
  await expect(tableCell(page, 0, 0)).toBeVisible();
}

async function tableDimensions(page) {
  const rows = await page.locator('[data-testid="table-block"] table tr').count();
  const cols = rows
    ? await page.locator('[data-testid="table-block"] table tr').first().locator("input").count()
    : 0;
  return { rows, cols };
}

async function openCellContextMenu(page, row, col) {
  const cell = tableCell(page, row, col);
  await cell.click({ button: "right" });
}

export const tableCellEditingScenarios = [
  defineScenario(
    "33. Table Cell Editing",
    "Cell focus",
    "typing in a cell keeps focus inside that same cell",
    async ({ page, appUrl }) => {
      await openFreshTable(page, appUrl);

      const firstCell = tableCell(page, 0, 0);
      await firstCell.click();
      await page.keyboard.type("Alpha");

      await expect(firstCell).toHaveValue("Alpha");
      await expect(firstCell).toBeFocused();
    },
  ),
  defineScenario(
    "33. Table Cell Editing",
    "Keyboard movement",
    "Tab and Shift+Tab move focus to next and previous cells",
    async ({ page, appUrl }) => {
      await openFreshTable(page, appUrl);

      await tableCell(page, 0, 0).click();
      await tableCell(page, 0, 0).press("Tab");
      await expect(tableCell(page, 0, 1)).toBeFocused();

      await tableCell(page, 0, 1).press("Shift+Tab");
      await expect(tableCell(page, 0, 0)).toBeFocused();
    },
  ),
  defineScenario(
    "33. Table Cell Editing",
    "Add row",
    "Add Row inserts a new row below the active row instead of only appending at the end",
    async ({ page, appUrl }) => {
      await openFreshTable(page, appUrl);

      await tableCell(page, 1, 0).fill("anchor");
      await tableCell(page, 2, 0).fill("tail");
      await tableCell(page, 1, 0).click();
      await page.getByTestId("table-block").hover();
      await page.getByTestId("table-add-row").click();

      await expect(tableCell(page, 2, 0)).toBeVisible();
      await expect(tableCell(page, 2, 0)).toHaveValue("");
      await expect(tableCell(page, 3, 0)).toHaveValue("tail");
      expect(await tableDimensions(page)).toEqual({ rows: 4, cols: 3 });
    },
  ),
  defineScenario(
    "33. Table Cell Editing",
    "Add column",
    "Add Column inserts a new column to the right of the active cell",
    async ({ page, appUrl }) => {
      await openFreshTable(page, appUrl);

      await tableCell(page, 0, 1).fill("anchor");
      await tableCell(page, 0, 2).fill("tail");
      await tableCell(page, 0, 1).click();
      await page.getByTestId("table-block").hover();
      await page.getByTestId("table-add-column").click();

      await expect(tableCell(page, 0, 2)).toBeVisible();
      await expect(tableCell(page, 0, 2)).toHaveValue("");
      await expect(tableCell(page, 0, 3)).toHaveValue("tail");
      expect(await tableDimensions(page)).toEqual({ rows: 3, cols: 4 });
    },
  ),
  defineScenario(
    "33. Table Cell Editing",
    "Context menu deletion",
    "Delete Row and Delete Column remove the targeted structure from the table",
    async ({ page, appUrl }) => {
      await openFreshTable(page, appUrl);

      await openCellContextMenu(page, 1, 1);
      await page.getByRole("button", { name: "Delete row" }).click();
      expect(await tableDimensions(page)).toEqual({ rows: 2, cols: 3 });

      await openCellContextMenu(page, 0, 1);
      await page.getByRole("button", { name: "Delete column" }).click();
      expect(await tableDimensions(page)).toEqual({ rows: 2, cols: 2 });
    },
  ),
  defineScenario(
    "33. Table Cell Editing",
    "Minimum size guards",
    "Delete Row and Delete Column disable themselves once the table reaches 1x1",
    async ({ page, appUrl }) => {
      await openFreshTable(page, appUrl);

      await openCellContextMenu(page, 0, 0);
      await page.getByRole("button", { name: "Delete row" }).click();
      await openCellContextMenu(page, 0, 0);
      await page.getByRole("button", { name: "Delete row" }).click();

      await openCellContextMenu(page, 0, 0);
      await expect(page.getByRole("button", { name: "Delete row" })).toBeDisabled();

      await page.getByRole("button", { name: "Delete column" }).click();
      await openCellContextMenu(page, 0, 0);
      await page.getByRole("button", { name: "Delete column" }).click();

      await openCellContextMenu(page, 0, 0);
      await expect(page.getByRole("button", { name: "Delete column" })).toBeDisabled();
      expect(await tableDimensions(page)).toEqual({ rows: 1, cols: 1 });
      await expect(tableCells(page)).toHaveCount(1);
    },
  ),
  defineScenario(
    "33. Table Cell Editing",
    "Enter behavior",
    "Enter on a cell inserts a new row directly below the focused row and keeps column position",
    async ({ page, appUrl }) => {
      await openFreshTable(page, appUrl);

      await tableCell(page, 2, 1).fill("tail");
      await tableCell(page, 1, 1).click();
      await tableCell(page, 1, 1).press("Enter");

      await expect(tableCell(page, 2, 1)).toBeVisible();
      await expect(tableCell(page, 2, 1)).toHaveValue("");
      await expect(tableCell(page, 3, 1)).toHaveValue("tail");
      expect(await tableDimensions(page)).toEqual({ rows: 4, cols: 3 });
    },
  ),
];

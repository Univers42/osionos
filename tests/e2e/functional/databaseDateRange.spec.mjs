/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseDateRange.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          #+#    #+#             */
/*   Created: 2026/07/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A date interval is ONE concept across views: drawing a range on the timeline
// pairs the start property with its end property (schema-level), the table's
// date cell shows "Jul 8, 2026 → Jul 25, 2026" with the arrow, and the cell's
// picker edits both ends via the End-date toggle. Values stay two plain ISO
// date columns — always valid for the Postgres data plane.

import { test, expect } from "@playwright/test";

import { addPropertyOfType, addView, insertInlineDatabase } from "../support/databaseHelpers.mjs";

const CELL = 48; // week-zoom cell width

test.describe("database-date-range", () => {
  test("a range drawn on the timeline shows as start → end in the table cell", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await block.hover();
    await block.getByRole("button", { name: "New", exact: true }).last().click();
    await addPropertyOfType(block, page, "Date", "Kickoff");
    await addView(block, page, "Timeline");
    const row = block.locator('[role="row"]').first();
    await row.waitFor({ timeout: 10_000 });

    // Draw a 3-cell range on the record's lane.
    const box = await row.boundingBox();
    const y = box.y + box.height / 2;
    const x0 = box.x + 2 * CELL + CELL / 2;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.mouse.move(x0 + 3 * CELL, y, { steps: 6 });
    await page.mouse.up();
    await expect(row.locator("[data-timeline-bar]")).toBeVisible();

    // Back in the table, the Kickoff cell represents the whole interval.
    await block.getByText("Table", { exact: true }).first().click();
    await expect(block.locator("td").filter({ hasText: "→" }).first()).toBeVisible();
  });

  test("the date cell picker's End date toggle creates and shows the interval", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await block.hover();
    await block.getByRole("button", { name: "New", exact: true }).last().click();
    await addPropertyOfType(block, page, "Date", "When");

    // Open the date cell (the LAST "Empty" cell — the blank title also says
    // Empty). Spreadsheet model: click selects, DOUBLE-click starts editing.
    const dateCell = block.locator("tbody tr").first().getByText("Empty", { exact: true }).last();
    await dateCell.dblclick();
    const startInput = page.getByPlaceholder("Start date");
    await startInput.waitFor({ timeout: 5_000 });
    await startInput.fill("Jul 8, 2026");
    await startInput.press("Enter");

    // Toggle End date on — a default end appears, paired to the property.
    await page.getByText("End date", { exact: true }).click();
    await page.keyboard.press("Escape");

    const cell = block.locator("td").filter({ hasText: "Jul 8, 2026" }).first();
    await expect(cell).toContainText("→");
  });
});

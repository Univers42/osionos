/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseTimeline.spec.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          #+#    #+#             */
/*   Created: 2026/07/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Timeline view interactions: grab-and-slide on a dateless record's lane
// CREATES its date range (live ghost); bar edges resize the range and write
// the date property back; the toolbar "Dates" menu picks WHICH date property
// drives the timeline when several exist (different kinds of time).

import { test, expect } from "@playwright/test";

import { addPropertyOfType, addView, insertInlineDatabase } from "../support/databaseHelpers.mjs";

const CELL = 48; // week-zoom cell width

async function setupTimelineWithDatelessRecord(page) {
  const block = await insertInlineDatabase(page);
  // A record with NO date yet (table-bottom + New), then a Date property.
  await block.hover();
  await block.getByRole("button", { name: "New", exact: true }).last().click();
  await addPropertyOfType(block, page, "Date", "Kickoff");
  // Switch to a fresh Timeline view.
  await addView(block, page, "Timeline");
  const row = block.locator('[role="row"]').first();
  await row.waitFor({ timeout: 10_000 });
  return { block, row };
}

test.describe("database-timeline", () => {
  test("grab-and-slide on an empty lane creates the record's date range live", async ({ page }) => {
    const { block, row } = await setupTimelineWithDatelessRecord(page);
    await expect(row.getByText("No date")).toBeVisible();

    const box = await row.boundingBox();
    const y = box.y + box.height / 2;
    const x0 = box.x + 2 * CELL + CELL / 2;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.mouse.move(x0 + 3 * CELL, y, { steps: 6 });
    // Mid-drag: the ghost bar previews the range live before release.
    await expect(row.locator("[data-timeline-bar]")).toBeVisible();
    await page.mouse.up();

    // Committed: the record now has a real bar and no "No date" hint.
    await expect(row.locator("[data-timeline-bar]")).toBeVisible();
    await expect(row.getByText("No date")).toHaveCount(0);
  });

  test("dragging a bar edge extends the range and survives re-render", async ({ page }) => {
    const { row } = await setupTimelineWithDatelessRecord(page);
    const box = await row.boundingBox();
    const y = box.y + box.height / 2;
    const x0 = box.x + 2 * CELL + CELL / 2;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.mouse.move(x0 + 2 * CELL, y, { steps: 4 });
    await page.mouse.up();

    const bar = row.locator("[data-timeline-bar]");
    const before = (await bar.boundingBox()).width;
    // Grab the RIGHT edge and slide +2 cells.
    const barBox = await bar.boundingBox();
    await page.mouse.move(barBox.x + barBox.width - 3, y);
    await page.mouse.down();
    await page.mouse.move(barBox.x + barBox.width - 3 + 2 * CELL, y, { steps: 4 });
    await page.mouse.up();

    const after = (await bar.boundingBox()).width;
    expect(after - before).toBeGreaterThan(CELL * 1.5);
  });

  test("the Dates menu switches which date property drives the timeline", async ({ page }) => {
    const { block, row } = await setupTimelineWithDatelessRecord(page);
    await addPropertyOfTypeInTimeline(block, page);

    // Give the record a single-day Kickoff (a plain click writes ONLY the
    // start property — a drag would also fill the auto-detected end prop,
    // which with two date props is "Deadline" itself).
    const box = await row.boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 2 * CELL + 10, y);
    await page.mouse.down();
    await page.mouse.up();
    await expect(row.locator("[data-timeline-bar]")).toBeVisible();

    // Switch the timeline to run on "Deadline" — the record has no Deadline,
    // so its bar disappears; switching back restores it.
    await block.locator('[aria-label="Timeline date settings"]').click();
    await page.getByRole("group", { name: "Show timeline by" }).getByRole("menuitemradio", { name: "Deadline" }).click();
    await expect(row.locator("[data-timeline-bar]")).toHaveCount(0);
    await expect(row.getByText("No date")).toBeVisible();

    await block.locator('[aria-label="Timeline date settings"]').click();
    await page.getByRole("group", { name: "Show timeline by" }).getByRole("menuitemradio", { name: "Kickoff" }).click();
    await expect(row.locator("[data-timeline-bar]")).toBeVisible();
  });
});

/** Add the second date property ("Deadline") from within the timeline view is
 *  not possible — hop through the table view tab, add it, come back. */
async function addPropertyOfTypeInTimeline(block, page) {
  await block.getByText("Table", { exact: true }).first().click();
  await addPropertyOfType(block, page, "Date", "Deadline");
  await block.getByText("Timeline", { exact: true }).first().click();
  await block.locator('[role="row"]').first().waitFor();
}

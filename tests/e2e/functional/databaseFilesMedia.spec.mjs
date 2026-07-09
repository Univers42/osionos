/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseFilesMedia.spec.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          #+#    #+#             */
/*   Created: 2026/07/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A files & media cell accumulates many attachments per record (a record can
// relate to several files) and previews them in place: clicking an attachment's
// Preview button opens the image/video/other viewer without leaving the cell.

import { test, expect } from "@playwright/test";

import { addPropertyOfType, insertInlineDatabase } from "../support/databaseHelpers.mjs";

// A 1×1 PNG (smallest valid). Buffer bytes for the transparent pixel.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

function pngFile(name) {
  return { name, mimeType: "image/png", buffer: PNG_1PX };
}

async function openFilesCell(page) {
  const block = await insertInlineDatabase(page);
  await block.hover();
  await block.getByRole("button", { name: "New", exact: true }).last().click();
  await addPropertyOfType(block, page, "Files & media", "Assets");
  // Spreadsheet model: single click selects, DOUBLE-click edits. The files cell
  // is the LAST "No files" placeholder on the first row.
  const cell = block.locator("tbody tr").first().getByText("No files", { exact: true }).last();
  await cell.dblclick();
  await page.getByRole("dialog").waitFor({ timeout: 5_000 });
  return block;
}

test.describe("database-files-media", () => {
  test("a record accumulates several attachments instead of replacing", async ({ page }) => {
    const block = await openFilesCell(page);
    const dialog = page.getByRole("dialog");
    const input = dialog.locator('input[type="file"]');

    await input.setInputFiles(pngFile("first.png"));
    await expect(dialog.getByText("first.png")).toBeVisible();

    // Adding a second file must KEEP the first — accumulation, not replace.
    await input.setInputFiles(pngFile("second.png"));
    await expect(dialog.getByText("first.png")).toBeVisible();
    await expect(dialog.getByText("second.png")).toBeVisible();

    // Closing, the cell chips reflect BOTH files.
    await page.keyboard.press("Escape");
    const firstRow = block.locator("tbody tr").first();
    await expect(firstRow.locator("img")).toHaveCount(2);
  });

  test("wrap-all-content stacks every attachment instead of capping at a row", async ({ page }) => {
    const block = await openFilesCell(page);
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type="file"]').setInputFiles(
      ["a.png", "b.png", "c.png", "d.png"].map(pngFile),
    );
    await expect(dialog.getByText("d.png")).toBeVisible();
    await page.keyboard.press("Escape");

    // Wrap OFF (default): a single clipped row — first 3 chips + a "+1" overflow.
    const firstRow = block.locator("tbody tr").first();
    await expect(firstRow.locator("img")).toHaveCount(3);
    await expect(firstRow.getByText("+1")).toBeVisible();

    // Turn on "Wrap content" from the Assets header menu.
    await block.locator("th", { hasText: "Assets" }).getByRole("button").first().click();
    await page.getByRole("button", { name: "Wrap content" }).click();

    // Wrap ON: all four stack, no overflow badge.
    await expect(firstRow.locator("img")).toHaveCount(4);
    await expect(firstRow.getByText("+1")).toHaveCount(0);
  });

  test("an attachment can be previewed in place", async ({ page }) => {
    const block = await openFilesCell(page);
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type="file"]').setInputFiles(pngFile("shot.png"));
    await expect(dialog.getByText("shot.png")).toBeVisible();

    // The gray Preview button opens the media viewer with the image visible.
    await dialog.getByRole("button", { name: "Preview shot.png" }).click();
    const viewer = page.getByRole("dialog", { name: "Media preview" });
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("img")).toBeVisible();
  });
});

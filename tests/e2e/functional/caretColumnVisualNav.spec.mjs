/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   caretColumnVisualNav.spec.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Canvas cells are FREE FRAMES: their model/DOM order diverges from the
// visual arrangement as soon as a cell is dragged. Caret block-crossing must
// follow the VISUAL order (left→right, top→bottom), not the flat DOM order —
// otherwise walking down the visually-first column skips the other columns
// (or dead-ends and the pane scrolls while the caret stays marooned).

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  openSlashMenuFromEditor,
  slashCommandEntry,
} from "../../browser/core/app.mjs";
import { setupCanvasFlag } from "../../browser/core/layout.mjs";

async function pointerDragBy(page, locator, deltaX, deltaY) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Could not resolve drag bounding box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  try {
    await page.mouse.move(startX + deltaX / 2, startY + deltaY / 2, { steps: 4 });
    await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 4 });
  } finally {
    await page.mouse.up();
  }
}

/** The [data-block-id] block that owns the caret (via the live selection). */
async function caretBlockText(page) {
  return page.evaluate(() => {
    const sel = globalThis.getSelection();
    const anchor = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
    const el = anchor ? (anchor.nodeType === 1 ? anchor : anchor.parentElement) : null;
    return el?.closest("[data-block-id]")?.textContent ?? null;
  });
}

/**
 * Build: "above the layout" paragraph + inline canvas layout with two cells,
 * cell A ("alpha …", model-first) and cell B ("beta one", model-last), then
 * DRAG A to the right of B so the visual order (B, A) inverts the model order.
 */
async function buildSwappedTwoCellLayout(page, baseURL) {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  // "Layout inline" converts the block the slash menu is opened in — type the
  // marker paragraph first and open the slash menu on a FRESH block below it.
  await page.keyboard.type("above the layout");
  await page.keyboard.press("Enter");
  const editors = page.locator('[role="textbox"][aria-multiline="true"]');
  await expect(editors).toHaveCount(2);
  await page.keyboard.type("/layout");
  const entry = slashCommandEntry(page, "Layout inline").last();
  await entry.waitFor();
  await entry.evaluate((node) => node.click());
  await expect(page.locator(".osionos-layout-block")).toBeVisible();
  await expect(page.getByText("above the layout")).toBeVisible();

  // Cell A (model-first), then drag it far right BEFORE adding cell B — the
  // new cell takes the freed top-left slot, so the visual order (B, A)
  // inverts the model order [A, B] without a fragile post-swap.
  await page.locator(".osionos-layout-empty-state").first()
    .getByRole("button", { name: /\+ Cell/i }).click();
  const cells = page.locator(".osionos-layout-cell");
  await expect(cells).toHaveCount(1);
  const cellAEditors = cells.first().locator('[role="textbox"][aria-multiline="true"]');
  await cellAEditors.first().click();
  await page.keyboard.type("alpha one");
  await page.keyboard.press("Enter");
  // Enter mounts the new block asynchronously — wait for it before typing,
  // otherwise the text lands in the previous block.
  await expect(cellAEditors).toHaveCount(2);
  await cellAEditors.nth(1).click();
  await page.keyboard.type("alpha two");
  await expect(page.getByText("alpha two")).toBeVisible();
  // Blur to commit the block draft BEFORE dragging the cell — the drag
  // re-mounts the cell subtree and would drop an uncommitted draft.
  await page.getByText("above the layout").click();
  await page.waitForTimeout(400);

  const cellA = cells.first();
  await cellA.hover(); // the drag handle is hover-revealed cell chrome
  const stageBox = await page.locator(".osionos-layout-block").boundingBox();
  const boxA = await cellA.boundingBox();
  await pointerDragBy(
    page,
    cellA.locator(".osionos-layout-cell-drag"),
    stageBox.x + stageBox.width - (boxA.x + boxA.width) - 24,
    0,
  );

  await page.locator(".osionos-layout-toolbar")
    .getByRole("button", { name: /Add cell/i }).click();
  await expect(cells).toHaveCount(2);
  const cellB = cells.nth(1);
  await cellB.locator('[role="textbox"][aria-multiline="true"]').first().click();
  await page.keyboard.type("beta one");

  await expect
    .poll(async () => {
      const a = await cellA.boundingBox();
      const b = await cellB.boundingBox();
      return a && b ? a.x > b.x : false;
    }, { message: "cell A must sit visually right of cell B" })
    .toBe(true);
}

test.describe("caret crosses layout columns in visual order", () => {
  test.beforeEach(async ({ page }) => {
    await setupCanvasFlag(page, true);
  });

  test("ArrowDown at the end of the visually-first column enters the next column", async ({ page, baseURL }) => {
    await buildSwappedTwoCellLayout(page, baseURL);

    // Caret at the end of "beta one" — the only block of the visually-FIRST
    // (but model-last) column.
    await page.getByText("beta one").click();
    await page.keyboard.press("End");

    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() => caretBlockText(page), {
        message: "caret should land in the visually-next column's first block",
      })
      .toContain("alpha one");

    // And onward: down through the second column.
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => caretBlockText(page)).toContain("alpha two");
  });

  test("ArrowUp at the top of a column enters the previous visual column's last block", async ({ page, baseURL }) => {
    await buildSwappedTwoCellLayout(page, baseURL);

    // Caret in "alpha one" — first block of the visually-SECOND column.
    await page.getByText("alpha one").click();
    await page.keyboard.press("Home");

    await page.keyboard.press("ArrowUp");
    await expect
      .poll(() => caretBlockText(page), {
        message: "caret should land in the visually-previous column's last block",
      })
      .toContain("beta one");
  });

  test("ArrowUp from the visually-first column's first block exits above the layout", async ({ page, baseURL }) => {
    await buildSwappedTwoCellLayout(page, baseURL);

    await page.getByText("beta one").click();
    await page.keyboard.press("Home");

    await page.keyboard.press("ArrowUp");
    await expect
      .poll(() => caretBlockText(page), {
        message: "caret should leave the layout upward",
      })
      .toContain("above the layout");
  });
});

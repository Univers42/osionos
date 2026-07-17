/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layoutEditorV2.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* global PointerEvent */

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  openSlashMenuFromEditor,
  slashCommandEntry,
} from "../../browser/core/app.mjs";
import { readCellGrid, setupCanvasFlag } from "../../browser/core/layout.mjs";

async function createInlineLayout(page, appUrl) {
  await openFreshPage(page, appUrl);
  const editor = await activateFirstEditor(page);
  await openSlashMenuFromEditor(editor, "/layout");
  const entry = slashCommandEntry(page, "Layout inline").last();
  await entry.waitFor();
  await entry.evaluate((node) => node.click());
  await expect(page.locator(".osionos-layout-block")).toBeVisible();
}

async function addLayoutCell(page, expectedCount = 1) {
  if (expectedCount === 1) {
    await page.locator(".osionos-layout-empty-state").first().getByRole("button", { name: /\+ Cell/i }).click();
  } else {
    await page.locator(".osionos-layout-toolbar").getByRole("button", { name: /Add cell/i }).click();
  }
  const cells = page.locator(".osionos-layout-cell");
  await expect(cells).toHaveCount(expectedCount);
  return cells.nth(expectedCount - 1);
}

async function pointerDragBy(page, locator, deltaX, deltaY, midDrag) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Could not resolve drag bounding box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  try {
    await page.mouse.move(startX + deltaX / 2, startY + deltaY / 2, { steps: 4 });
    if (midDrag) await midDrag();
    await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 4 });
  } finally {
    await page.mouse.up();
  }
}

/** Click the non-interactive lower body of a cell to select it without entering an editor. */
async function selectCellBody(page, cell) {
  const box = await cell.boundingBox();
  if (!box) throw new Error("Could not resolve cell bounding box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 28);
}

function cellX(cell) {
  return cell.evaluate((node) => node.style.getPropertyValue("--osio-cell-x"));
}

test.describe("layout editor (canvas v2)", () => {
  test.beforeEach(async ({ page }) => {
    await setupCanvasFlag(page, true);
  });

  test("alignment guides appear while dragging along a neighbour", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    await addLayoutCell(page, 1);
    const cell = await addLayoutCell(page, 2);

    await pointerDragBy(page, cell.locator(".osionos-layout-cell-drag"), 0, 80, async () => {
      await expect(page.locator(".osionos-layout-alignment-guide").first()).toBeVisible();
    });
  });

  test("snap-to-grid toggle controls whether free positions persist", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page, 1);
    const toolbar = page.locator(".osionos-layout-toolbar");

    await pointerDragBy(page, cell.locator(".osionos-layout-cell-drag"), 50, 0);
    const snapped = await cellX(cell);
    expect(Number.parseFloat(snapped) % 112).toBe(0); // columnWidth 96 + gap 16

    await toolbar.getByRole("button", { name: /Snap on/i }).click();
    await pointerDragBy(page, cell.locator(".osionos-layout-cell-drag"), 50, 0);
    await expect.poll(async () => Number.parseFloat(await cellX(cell)) % 112).not.toBe(0);
  });

  test("keyboard moves, resizes, duplicates and deletes the selected cell", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page, 1);
    await selectCellBody(page, cell);
    await expect(cell).toHaveAttribute("data-layout-cell-selected", "true");

    const before = await readCellGrid(cell);
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await readCellGrid(cell)).colStart).not.toBe(before.colStart);

    const span = await readCellGrid(cell);
    await page.keyboard.press("Shift+ArrowRight");
    await expect.poll(async () => (await readCellGrid(cell)).colEnd).not.toBe(span.colEnd);

    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await readCellGrid(cell)).colStart).toBe(before.colStart);

    await page.keyboard.press("Control+d");
    await expect(page.locator(".osionos-layout-cell")).toHaveCount(2);

    await page.keyboard.press("Delete");
    await expect(page.locator(".osionos-layout-cell")).toHaveCount(1);
  });

  test("marquee selects multiple cells and moves them as one undo step", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    await addLayoutCell(page, 1);
    await addLayoutCell(page, 2);
    const cells = page.locator(".osionos-layout-cell");
    const stage = page.locator(".osio-canvas-v2-stage");
    const stageBox = await stage.boundingBox();
    const firstBox = await cells.nth(0).boundingBox();
    const secondBox = await cells.nth(1).boundingBox();
    if (!stageBox || !firstBox || !secondBox) throw new Error("Could not resolve marquee boxes");

    // Sweep from the empty right side across both cells. Canvas V2 cells sit
    // flush with the stage's own top edge (no padding, unlike the legacy CSS
    // grid) — starting 4px ABOVE the first cell lands outside the stage
    // element entirely, so the drag never reaches CanvasStage's
    // onPointerDownCapture and no marquee ever starts. Start just inside the
    // stage/cell's top edge instead; the rectangle still spans both cells.
    await page.mouse.move(stageBox.x + stageBox.width - 8, firstBox.y + 4);
    await page.mouse.down();
    await page.mouse.move(firstBox.x + 8, secondBox.y + secondBox.height - 8, { steps: 6 });
    await page.mouse.up();
    await expect(cells.nth(0)).toHaveAttribute("data-layout-cell-selected", "true");
    await expect(cells.nth(1)).toHaveAttribute("data-layout-cell-selected", "true");

    const firstBefore = await readCellGrid(cells.nth(0));
    const secondBefore = await readCellGrid(cells.nth(1));
    await pointerDragBy(page, cells.nth(0).locator(".osionos-layout-cell-drag"), 230, 0);
    await expect.poll(async () => (await readCellGrid(cells.nth(0))).colStart).not.toBe(firstBefore.colStart);
    await expect.poll(async () => (await readCellGrid(cells.nth(1))).colStart).not.toBe(secondBefore.colStart);

    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await readCellGrid(cells.nth(0))).colStart).toBe(firstBefore.colStart);
    await expect.poll(async () => (await readCellGrid(cells.nth(1))).colStart).toBe(secondBefore.colStart);
  });

  test("dropping onto an occupied slot pushes the occupant down", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const topCell = await addLayoutCell(page, 1);
    const bottomCell = await addLayoutCell(page, 2);
    const topBox = await topCell.boundingBox();
    const bottomBox = await bottomCell.boundingBox();
    if (!topBox || !bottomBox) throw new Error("Could not resolve push-down boxes");

    await pointerDragBy(page, bottomCell.locator(".osionos-layout-cell-drag"), 0, topBox.y - bottomBox.y);

    await expect.poll(async () => (await readCellGrid(bottomCell)).rowStart).toBe("1");
    await expect.poll(async () => Number.parseInt((await readCellGrid(topCell)).rowStart, 10)).toBeGreaterThan(1);
  });

  test("cell menu dismisses on outside click", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page, 1);
    await cell.hover();
    await cell.getByRole("button", { name: "Cell menu" }).click();
    const menu = page.locator(".osionos-layout-cell-menu");
    await expect(menu).toBeVisible();

    await page.getByRole("textbox", { name: "Page title" }).click();
    await expect(menu).toBeHidden();
  });

  test("cell label stays in sync through undo", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page, 1);
    const title = cell.getByRole("textbox", { name: "Cell title" });

    await title.fill("Roadmap");
    await title.blur();
    await expect(title).toHaveValue("Roadmap");

    await selectCellBody(page, cell);
    await page.keyboard.press("Control+z");
    await expect(title).toHaveValue("");
  });

  test("inspector span maximum follows the configured column count", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page, 1);
    await page.getByRole("button", { name: "Layout settings" }).click();
    const settings = page.locator(".osionos-layout-settings-panel");
    await settings.locator(".osionos-layout-control-row", { hasText: "Columns" }).locator("input").fill("24");
    await settings.getByRole("button", { name: "Close layout settings" }).click();

    await selectCellBody(page, cell);
    // Canvas V2's floating selection toolbar "replaces the side inspector"
    // (CanvasSelectionToolbar.tsx) — selecting a cell only shows the compact
    // toolbar; the cell inspector itself is an on-demand panel behind its
    // "More options" button, not shown automatically on selection like legacy.
    await page.getByRole("button", { name: "More options" }).click();
    const inspector = page.locator(".osionos-layout-cell-inspector");
    await expect(inspector).toBeVisible();
    await expect(inspector.locator(".osionos-layout-control-row", { hasText: "Column span" }).locator("input")).toHaveAttribute("max", "24");
  });

  test("template gallery inserts every template from the toolbar", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const toolbar = page.locator(".osionos-layout-toolbar");
    await toolbar.getByRole("button", { name: /Templates/i }).click();
    await page.getByRole("menuitem", { name: /Kanban/i }).click();
    await expect(page.locator(".osionos-layout-cell")).toHaveCount(4);

    await toolbar.getByRole("button", { name: /Templates/i }).click();
    await page.getByRole("menuitem", { name: /Tracker/i }).click();
    await expect(page.locator(".osionos-layout-cell")).toHaveCount(4);

    await toolbar.getByRole("button", { name: /Templates/i }).click();
    await page.getByRole("menuitem", { name: /Two-column notes/i }).click();
    await expect(page.locator(".osionos-layout-cell")).toHaveCount(2);
  });
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layoutEditor.spec.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* global DataTransfer, PointerEvent, document, getComputedStyle, localStorage, window */

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  createParagraphs,
  getEditors,
  openFreshPage,
  openSlashMenuFromEditor,
  pressEnter,
  selectSlashMenuEntry,
  slashCommandEntry,
  slashMenu,
} from "../../browser/core/app.mjs";
import { isCanvasV2Run, readCellGrid, setupCanvasFlag } from "../../browser/core/layout.mjs";

async function selectLayoutCommand(page, label) {
  const entry = slashCommandEntry(page, label).last();
  await entry.waitFor();
  await entry.evaluate((node) => node.click());
}

async function createInlineLayout(page, appUrl) {
  await openFreshPage(page, appUrl);
  const editor = await activateFirstEditor(page);
  await openSlashMenuFromEditor(editor, "/layout");
  await selectLayoutCommand(page, "Layout inline");
  await expect(page.locator(".osionos-layout-block")).toBeVisible();
}

async function addLayoutCell(page) {
  const emptyState = page.locator(".osionos-layout-empty-state").first();
  await emptyState.getByRole("button", { name: /\+ Cell/i }).click();
  const cell = page.locator(".osionos-layout-cell").first();
  await expect(cell).toBeVisible();
  return cell;
}

async function syntheticDragDrop(page, source, target, targetPosition = "above") {
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error("Could not resolve drag target bounding box");
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());

  await source.dispatchEvent("dragstart", { dataTransfer });
  await target.dispatchEvent("dragover", {
    dataTransfer,
    clientX: targetBox.x + Math.min(24, Math.max(8, targetBox.width / 2)),
    clientY: targetBox.y + (targetPosition === "above" ? 2 : Math.max(4, targetBox.height - 2)),
  });
  await target.dispatchEvent("drop", {
    dataTransfer,
    clientX: targetBox.x + Math.min(24, Math.max(8, targetBox.width / 2)),
    clientY: targetBox.y + (targetPosition === "above" ? 2 : Math.max(4, targetBox.height - 2)),
  });
  await source.dispatchEvent("dragend", { dataTransfer });
  await dataTransfer.dispose();
}

async function pointerDragBy(page, locator, deltaX, deltaY) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Could not resolve drag handle bounding box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX / 2, startY + deltaY / 2, { steps: 4 });
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 4 });
  await page.mouse.up();
}

async function syntheticPointerDragBy(page, locator, deltaX, deltaY) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Could not resolve pointer drag target bounding box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await locator.dispatchEvent("pointerdown", {
    pointerId: 42,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: startX,
    clientY: startY,
  });
  await page.evaluate(({ clientX, clientY }) => {
    globalThis.dispatchEvent(new PointerEvent("pointermove", {
      pointerId: 42,
      pointerType: "mouse",
      buttons: 1,
      clientX,
      clientY,
      bubbles: true,
    }));
  }, { clientX: startX + deltaX / 2, clientY: startY + deltaY / 2 });
  await page.evaluate(({ clientX, clientY }) => {
    globalThis.dispatchEvent(new PointerEvent("pointerup", {
      pointerId: 42,
      pointerType: "mouse",
      button: 0,
      buttons: 0,
      clientX,
      clientY,
      bubbles: true,
    }));
  }, { clientX: startX + deltaX, clientY: startY + deltaY });
}

test.describe("layout editor", () => {
  test.beforeEach(async ({ page }) => {
    await setupCanvasFlag(page);
  });

  test("home renders an editable cross-database dashboard", async ({ page, baseURL }) => {
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("textbox", { name: "Page title" })).toHaveText("Workspace command center");
    await expect(page.locator(".osionos-page--layout-canvas")).toBeVisible();
    await expect(page.locator(".osionos-layout-toolbar")).toBeVisible();
    await expect(page.locator(".osionos-layout-cell")).toHaveCount(16);
    await expect(page.locator('.osionos-database-block[data-database-view-id="v-proj-dashboard"]')).toBeVisible();
    await expect(page.locator('.osionos-database-block[data-database-view-id="v-prod-table"]')).toBeVisible();
  });

  test("slash commands inside a layout cell use the real block editor surface", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page);
    const cellEditor = cell.locator('[role="textbox"][aria-multiline="true"]').first();

    await cellEditor.click();
    await page.keyboard.type("/hea");
    await expect(slashMenu(page)).toBeVisible();
    await selectSlashMenuEntry(page, "^Heading 1$");
    await page.keyboard.type("Inside cell");

    await expect(cell.locator('[data-block-type="heading_1"]').first()).toBeVisible();
    await expect(cellEditor).toHaveText("Inside cell");
  });

  test("dragging a page block into a layout cell moves the block across editor surfaces", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await createParagraphs(page, ["Outside"]);
    await pressEnter(getEditors(page).first());
    await openSlashMenuFromEditor(getEditors(page).nth(1), "/layout");
    await selectLayoutCommand(page, "Layout inline");
    const cell = await addLayoutCell(page);
    const targetBlock = cell.getByTestId("draggable-block").first();

    const sourceHandle = page.getByRole("button", { name: /Drag to reorder block/i }).first();
    await syntheticDragDrop(page, sourceHandle, targetBlock);

    await expect(cell.locator('[role="textbox"][aria-multiline="true"]').first()).toHaveText("Outside");
  });

  test("view slash command inserts a known database view", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await openSlashMenuFromEditor(editor, "/view tasks board");
    await selectLayoutCommand(page, "View: Tasks · Board");

    await expect(page.locator('.osionos-database-block[data-database-view-id="v-tasks-board"]')).toBeVisible();
  });

  test("dragging one cell handle onto another swaps their grid positions", async ({ page, baseURL }) => {
    test.skip(isCanvasV2Run, "Canvas V2 replaces drop-swap with collision push-down (covered in layoutEditorV2.spec.mjs)");
    await createInlineLayout(page, baseURL);
    const emptyState = page.locator(".osionos-layout-empty-state").first();
    await emptyState.getByRole("button", { name: /Use dashboard/i }).click();
    const cells = page.locator(".osionos-layout-cell");
    await expect(cells).toHaveCount(16);

    const firstCell = cells.nth(0);
    const secondCell = cells.nth(1);
    const firstBefore = await firstCell.evaluate((node) => getComputedStyle(node).gridColumnStart);
    const secondBefore = await secondCell.evaluate((node) => getComputedStyle(node).gridColumnStart);

    await syntheticDragDrop(page, firstCell.getByRole("button", { name: /Drag cell/i }), secondCell);

    await expect.poll(() => firstCell.evaluate((node) => getComputedStyle(node).gridColumnStart)).toBe(secondBefore);
    await expect.poll(() => secondCell.evaluate((node) => getComputedStyle(node).gridColumnStart)).toBe(firstBefore);
  });

  test("cell resize handles change the grid span", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page);
    const before = (await readCellGrid(cell)).colStart;

    await pointerDragBy(page, cell.locator(".osionos-layout-resize-hit--left"), 180, 0);

    await expect.poll(async () => (await readCellGrid(cell)).colStart).not.toBe(before);
  });

  test("auto-layout cell shows live resize dimensions before drop", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page);
    await cell.click();
    await page.locator(".osionos-layout-cell-inspector").getByRole("button", { name: /^auto$/ }).click();
    const before = await cell.locator(".osionos-layout-size-badge").textContent();
    const handle = cell.locator(".osionos-layout-resize-hit--bottom");
    const box = await handle.boundingBox();
    if (!box) throw new Error("Could not resolve resize handle bounding box");

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    try {
      await page.mouse.move(startX, startY + 150, { steps: 4 });
      await expect.poll(() => cell.locator(".osionos-layout-size-badge").textContent()).not.toBe(before);
    } finally {
      await page.mouse.up();
    }
  });

  test("layout grid keeps fixed row tracks for reliable collision math", async ({ page, baseURL }) => {
    test.skip(isCanvasV2Run, "Canvas V2 positions cells absolutely — there are no CSS grid tracks");
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page);
    await cell.click();
    await page.locator(".osionos-layout-cell-inspector").getByRole("button", { name: /^auto$/ }).click();
    await cell.locator(".osionos-layout-cell-editor").evaluate((node) => {
      const tallContent = document.createElement("div");
      tallContent.dataset.testTallAutoContent = "true";
      tallContent.style.height = "720px";
      node.appendChild(tallContent);
    });

    await expect.poll(() => page.locator(".osionos-layout-grid").evaluate((node) => getComputedStyle(node).gridAutoRows)).toBe("120px");
  });

  test("cell top resize handle changes the grid row", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page);

    await pointerDragBy(page, cell.locator(".osionos-layout-cell-drag"), 0, 220);
    const before = (await readCellGrid(cell)).rowStart;

    await syntheticPointerDragBy(page, cell.locator(".osionos-layout-resize-hit--top"), 0, -140);

    await expect.poll(async () => (await readCellGrid(cell)).rowStart).not.toBe(before);
  });

  test("selected fixed cell frame clips overflowing content", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page);
    await cell.click();
    const before = await cell.boundingBox();
    if (!before) throw new Error("Could not resolve layout cell bounding box");

    await cell.locator(".osionos-layout-cell-editor").evaluate((node) => {
      const tallContent = document.createElement("div");
      tallContent.dataset.testTallContent = "true";
      tallContent.style.height = "720px";
      node.appendChild(tallContent);
    });

    await expect.poll(async () => {
      const after = await cell.boundingBox();
      return Math.abs((after?.height ?? 0) - before.height);
    }).toBeLessThanOrEqual(2);
    await expect.poll(() => cell.locator(".osionos-layout-cell-editor").evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await expect.poll(() => cell.evaluate((node) => getComputedStyle(node).outlineOffset)).toBe("-2px");
  });

  test("focused layout cell does not show the extra resize outline", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page);

    await cell.locator('[role="textbox"][aria-multiline="true"]').first().click();

    await expect.poll(() => cell.locator(".osionos-layout-resize-overlay").evaluate((node) => getComputedStyle(node).opacity)).toBe("0");
  });

  test("cell move handle stays outside the diagonal resize handle", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page);
    await cell.click();

    await expect.poll(async () => cell.locator(".osionos-layout-cell-drag").evaluate((node) => {
      const cellRect = node.closest(".osionos-layout-cell")?.getBoundingClientRect();
      const dragRect = node.getBoundingClientRect();
      const cornerRect = node.closest(".osionos-layout-cell")?.querySelector(".osionos-layout-resize-hit--top-left")?.getBoundingClientRect();
      if (!cellRect || !cornerRect) return false;
      const separated = dragRect.right <= cornerRect.left || cornerRect.right <= dragRect.left || dragRect.bottom <= cornerRect.top || cornerRect.bottom <= dragRect.top;
      const alignedWithTopBorder = Math.abs(dragRect.top - cellRect.top) <= 2;
      const outsideLeftEdge = dragRect.right <= cellRect.left;
      return separated && outsideLeftEdge && alignedWithTopBorder;
    })).toBe(true);
  });

  test("cell grab handle previews fluid pointer movement before drop", async ({ page, baseURL }) => {
    test.skip(isCanvasV2Run, "Canvas V2 previews via --osio-cell-dx/dy gesture vars (covered in layoutEditorV2.spec.mjs)");
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page);
    const handle = cell.locator(".osionos-layout-cell-drag");
    const box = await handle.boundingBox();
    if (!box) throw new Error("Could not resolve drag handle bounding box");

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    try {
      await page.mouse.move(startX + 53, startY + 47, { steps: 3 });
      await expect.poll(() => cell.evaluate((node) => node.style.getPropertyValue("--osionos-layout-cell-offset-x"))).toBe("53px");
      await expect.poll(() => cell.evaluate((node) => node.style.getPropertyValue("--osionos-layout-cell-offset-y"))).toBe("47px");
    } finally {
      await page.mouse.up();
    }
  });

  test("cell grab handle moves a cell to a new grid slot", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page);
    const before = (await readCellGrid(cell)).rowStart;

    await pointerDragBy(page, cell.locator(".osionos-layout-cell-drag"), 0, 220);

    await expect.poll(async () => (await readCellGrid(cell)).rowStart).not.toBe(before);
    const after = (await readCellGrid(cell)).rowStart;
    expect(Number.parseInt(after, 10)).toBeLessThanOrEqual(4);

    await page.keyboard.press("Control+Z");
    await expect.poll(async () => (await readCellGrid(cell)).rowStart).toBe(before);

    await page.keyboard.press("Control+Shift+Z");
    await expect.poll(async () => (await readCellGrid(cell)).rowStart).toBe(after);
  });

  test("cell grab handle does not relocate to a nearby slot when target is occupied", async ({ page, baseURL }) => {
    test.skip(isCanvasV2Run, "Canvas V2 resolves collisions by pushing the occupant down (covered in layoutEditorV2.spec.mjs)");
    await createInlineLayout(page, baseURL);
    await page.locator(".osionos-layout-empty-state").first().getByRole("button", { name: /Use dashboard/i }).click();
    const cells = page.locator(".osionos-layout-cell");
    await expect(cells).toHaveCount(16);
    const firstCell = cells.nth(0);
    const secondCell = cells.nth(1);
    const beforeColumn = await firstCell.evaluate((node) => getComputedStyle(node).gridColumnStart);
    const beforeRow = await firstCell.evaluate((node) => getComputedStyle(node).gridRowStart);
    const firstBox = await firstCell.boundingBox();
    const targetBox = await secondCell.boundingBox();
    if (!firstBox || !targetBox) throw new Error("Could not resolve drag collision boxes");

    await syntheticPointerDragBy(page, firstCell.locator(".osionos-layout-cell-drag"), targetBox.x - firstBox.x, targetBox.y - firstBox.y);

    await expect.poll(() => firstCell.evaluate((node) => getComputedStyle(node).gridColumnStart)).toBe(beforeColumn);
    await expect.poll(() => firstCell.evaluate((node) => getComputedStyle(node).gridRowStart)).toBe(beforeRow);
    await expect.poll(() => firstCell.evaluate((node) => node.dataset.layoutCellCollision)).toBe("true");
  });

  test("cell grab handle can move into implicit rows below the base grid", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page);

    await syntheticPointerDragBy(page, cell.locator(".osionos-layout-cell-drag"), 0, 720);

    await expect.poll(async () => Number.parseInt((await readCellGrid(cell)).rowStart, 10)).toBeGreaterThan(5);
  });

  test("cell inspector docks to the viewport edge and closes from the canvas", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page);
    await cell.click();

    const inspector = page.locator(".osionos-layout-cell-inspector");
    const layoutBlock = page.locator(".osionos-layout-block").first();
    await expect(inspector).toBeVisible();
    await expect.poll(() => inspector.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return Math.round(window.innerWidth - rect.right);
    })).toBe(0);
    await expect.poll(async () => {
      const blockRight = await layoutBlock.evaluate((node) => node.getBoundingClientRect().right);
      const panelLeft = await inspector.evaluate((node) => node.getBoundingClientRect().left);
      return Math.round(panelLeft - blockRight);
    }).toBeGreaterThanOrEqual(12);

    await page.getByRole("textbox", { name: "Page title" }).click();
    await expect(inspector).toBeHidden();
  });

  test("layout settings panel closes from view mode", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    await page.getByRole("button", { name: "Layout settings" }).click();

    const settings = page.locator(".osionos-layout-settings-panel");
    await expect(settings).toBeVisible();
    await settings.getByRole("button", { name: "view" }).click();
    await expect(settings).toBeVisible();
    await settings.getByRole("button", { name: "Close layout settings" }).click();
    await expect(settings).toBeHidden();
  });

  test("full-page layout command creates a linked layout canvas page", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await openSlashMenuFromEditor(editor, "/layout");
    await selectLayoutCommand(page, "Layout full page");

    await expect(page.getByRole("textbox", { name: "Page title" })).toHaveText("Layout dashboard");
    await expect(page.locator(".osionos-page--layout-canvas")).toBeVisible();
    await expect(page.locator('.osionos-layout-block[data-layout-mode="full_page"]')).toBeVisible();
    await expect(page.locator(".osionos-layout-cell")).toHaveCount(16);

    await expect.poll(() => page.evaluate(() => {
      const rawPages = localStorage.getItem("pg:pages");
      if (!rawPages) return false;
      const pages = Object.values(JSON.parse(rawPages)).flat();
      const sourcePage = pages.find((entry) => entry.title === "Untitled");
      return Boolean(sourcePage?.content?.some((block) => String(block.content).includes("[[page:")));
    })).toBe(true);
  });
});

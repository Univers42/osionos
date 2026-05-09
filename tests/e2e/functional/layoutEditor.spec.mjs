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

test.describe("layout editor", () => {
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

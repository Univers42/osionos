/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   canvasHugAndVisibility.spec.mjs                    :+:      :+:    :+:   */
/*                                                    +#+#+ +#+        :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The canvas primitives of P4-4 in the browser: a hug cell that grows with
// its content and can be frozen at the height it measures, a page turned into
// a dashboard, and a cell shown or hidden by a formula over the page's own
// properties.

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  openSlashMenuFromEditor,
  slashCommandEntry,
} from "../../browser/core/app.mjs";
import { setupCanvasFlag } from "../../browser/core/layout.mjs";

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

/**
 * Select a cell without entering its editor: the click lands on the cell's
 * top padding, which is not an interactive target, so the stage selects the
 * cell instead of focusing the block editor.
 */
async function selectCell(cell) {
  const box = await cell.boundingBox();
  if (!box) throw new Error("Could not resolve cell bounding box");
  await cell.click({ position: { x: Math.round(box.width / 2), y: 6 } });
  await expect(cell).toHaveAttribute("data-layout-cell-selected", "true");
}

async function openCellInspector(page) {
  await page.getByRole("button", { name: "More options" }).click();
  const inspector = page.locator(".osionos-layout-cell-inspector");
  await expect(inspector).toBeVisible();
  return inspector;
}

const cellHeight = async (cell) => (await cell.boundingBox())?.height ?? 0;

/**
 * Type lines into the cell's block editor. The lines are separated by soft
 * breaks (Shift+Enter), so the content grows inside one block — the editor
 * element is not re-created between the lines.
 */
async function typeLines(page, cell, lines) {
  const editor = cell.locator('[role="textbox"][aria-multiline="true"]').first();
  await editor.click();
  await expect(editor).toBeFocused();
  for (const [index, line] of lines.entries()) {
    if (index > 0) await page.keyboard.press("Shift+Enter");
    await page.keyboard.type(line);
  }
  await expect(cell).toContainText(lines[lines.length - 1]);
}

/** Put the caret at the end of the cell's last block. */
async function focusLastEditor(page, cell) {
  const editors = cell.locator('[role="textbox"][aria-multiline="true"]');
  await editors.last().click();
  await page.keyboard.press("Control+End");
}

/** The saved height of the page's first canvas cell, straight from the store. */
const savedHeight = (page) => page.evaluate(async () => {
  const { usePageStore } = await import("/src/store/usePageStore.ts");
  const store = usePageStore.getState();
  const entry = store.pageById(store.activePage?.id);
  const layout = entry?.content?.find((block) => block.type === "layout");
  return layout?.layoutCells?.[0]?.measuredHeight ?? null;
});

/** Set the page's "status" property (the formula's context). */
const setStatus = (page, value) => page.evaluate(async (status) => {
  const { usePageStore } = await import("/src/store/usePageStore.ts");
  const store = usePageStore.getState();
  const pageId = store.activePage?.id;
  const current = store.pageById(pageId)?.properties ?? [];
  store.patchPage(pageId, {
    properties: [...current.filter((property) => property.key !== "status"), { key: "status", label: "Status", type: "select", value: status }],
  });
}, value);

/** The formula saved on a canvas cell of the open page. */
const savedFormula = (page, cellId) => page.evaluate(async (id) => {
  const { usePageStore } = await import("/src/store/usePageStore.ts");
  const store = usePageStore.getState();
  const entry = store.pageById(store.activePage?.id);
  const layout = entry?.content?.find((block) => block.type === "layout");
  return layout?.layoutCells?.find((cell) => cell.id === id)?.visibilityFormula ?? null;
}, cellId);

test.describe("canvas hug height, dashboard and visibility", () => {
  test.beforeEach(async ({ page }) => {
    await setupCanvasFlag(page, true);
  });

  test("a hug cell grows with its content, and a saved height freezes it", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page, 1);
    await selectCell(cell);
    const inspector = await openCellInspector(page);

    // "auto-height" is the sizing that measures the content ("hug").
    await inspector.locator(".osionos-layout-control-row", { hasText: "Auto-layout" })
      .getByRole("button", { name: "auto-height" }).click();
    await expect(cell).toHaveAttribute("data-layout-sizing", "auto-height");
    // One row, so the content is what decides the cell's height.
    await inspector.locator(".osionos-layout-control-row", { hasText: "Row span" }).locator("input").fill("1");

    const before = await cellHeight(cell);
    await typeLines(page, cell, ["one", "two", "three"]);
    await expect.poll(() => cellHeight(cell)).toBeGreaterThan(before);

    // The measurement is what the pin freezes.
    await inspector.getByRole("button", { name: "Save measured height" }).click();
    await expect(cell).toHaveAttribute("data-layout-sizing", "fixed");
    await expect.poll(() => savedHeight(page)).toBeGreaterThan(0);
    const pinned = await savedHeight(page);

    // The frozen cell stops growing.
    const frozen = await cellHeight(cell);
    await focusLastEditor(page, cell);
    await page.keyboard.type("more");
    await expect(cell).toContainText("more");
    expect(Math.abs(await cellHeight(cell) - frozen)).toBeLessThanOrEqual(2);

    // The frozen cell keeps its height across a reload.
    await page.evaluate(async () => {
      const { flushScheduledPagesCachePersist } = await import("/src/store/pageStore.helpers.ts");
      flushScheduledPagesCachePersist();
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    const reloaded = page.locator(".osionos-layout-cell").first();
    await expect(reloaded).toBeVisible();
    await expect(reloaded).toHaveAttribute("data-layout-sizing", "fixed");
    expect(Math.abs(await cellHeight(reloaded) - pinned)).toBeLessThanOrEqual(2);

    // "Auto height" releases the pin: the content drives the height again.
    await selectCell(reloaded);
    const reopened = await openCellInspector(page);
    await reopened.getByRole("button", { name: "Auto height" }).click();
    await expect(reloaded).toHaveAttribute("data-layout-sizing", "auto-height");
    await expect.poll(() => savedHeight(page)).toBe(null);

    const grownBefore = await cellHeight(reloaded);
    await focusLastEditor(page, reloaded);
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("four");
    await expect(reloaded).toContainText("four");
    await expect.poll(() => cellHeight(reloaded)).toBeGreaterThan(grownBefore);
  });

  test("a blank page can be turned into a dashboard", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await expect(page.locator(".osionos-layout-cell")).toHaveCount(0);

    await page.getByRole("button", { name: "Open page configuration" }).click();
    await page.getByRole("button", { name: "Turn into dashboard" }).click();

    await expect(page.locator('.osionos-layout-block[data-layout-mode="full_page"]')).toBeVisible();
    await expect(page.locator(".osionos-layout-cell")).toHaveCount(13);
  });

  test("a cell's visibility formula follows the page's own property", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const first = await addLayoutCell(page, 1);
    const second = await addLayoutCell(page, 2);
    const firstId = await first.getAttribute("data-layout-cell-id");
    const secondId = await second.getAttribute("data-layout-cell-id");
    await setStatus(page, "active");

    await selectCell(first);
    const inspector = await openCellInspector(page);
    const field = inspector.getByLabel("Visibility formula");
    await field.fill('prop("status") == "active"');
    await field.press("Enter");

    // The formula is true for "active": the cell stays in the DOM.
    await expect(page.locator(`[data-layout-cell-id="${firstId}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-layout-cell-id="${secondId}"]`)).toBeVisible();

    // The formula is false for "done": the cell leaves the DOM, the other stays.
    await setStatus(page, "done");
    await expect(page.locator(`[data-layout-cell-id="${firstId}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-layout-cell-id="${secondId}"]`)).toBeVisible();
    await expect(page.locator(".osionos-layout-cell")).toHaveCount(1);

    // The hidden cell is not deleted: the page still carries it with its
    // formula, so the inspector can reach it and bring it back.
    await expect.poll(() => savedFormula(page, firstId)).toBe('prop("status") == "active"');
    await page.locator(".osionos-layout-toolbar").getByRole("button", { name: "Inspector" }).click();
    const panel = page.locator(".osionos-layout-cell-inspector");
    await expect(panel).toBeVisible();
    await panel.getByLabel("Visibility formula").fill("");
    await panel.getByLabel("Visibility formula").press("Enter");
    await expect(page.locator(`[data-layout-cell-id="${firstId}"]`)).toHaveCount(1);
  });

  test("every hidden cell is listed and can be edited, not only the first", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const first = await addLayoutCell(page, 1);
    const second = await addLayoutCell(page, 2);
    const firstId = await first.getAttribute("data-layout-cell-id");
    const secondId = await second.getAttribute("data-layout-cell-id");
    await setStatus(page, "done");

    // Hide the second first and address both cells by id: a hidden cell
    // leaves the DOM, so a positional locator would shift.
    for (const id of [secondId, firstId]) {
      const cell = page.locator(`[data-layout-cell-id="${id}"]`);
      await selectCell(cell);
      // The panel may still be open from the previous cell: "More options" toggles it.
      const open = page.locator(".osionos-layout-cell-inspector");
      const inspector = (await open.isVisible()) ? open : await openCellInspector(page);
      const field = inspector.getByLabel("Visibility formula");
      await field.fill('prop("status") == "active"');
      await field.press("Enter");
    }
    await expect(page.locator(".osionos-layout-cell")).toHaveCount(0);

    const list = page.getByLabel("Hidden cells", { exact: true });
    await expect(list.getByRole("button")).toHaveCount(2);

    // The second hidden cell is reachable through its own entry.
    await list.getByRole("button").nth(1).click();
    const panel = page.locator(".osionos-layout-cell-inspector");
    await expect(panel).toBeVisible();
    await panel.getByLabel("Visibility formula").fill("");
    await panel.getByLabel("Visibility formula").press("Enter");
    await expect(page.locator(`[data-layout-cell-id="${secondId}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-layout-cell-id="${firstId}"]`)).toHaveCount(0);
    await expect(list.getByRole("button")).toHaveCount(1);
  });

  test("an invalid visibility formula keeps the cell visible and says why", async ({ page, baseURL }) => {
    await createInlineLayout(page, baseURL);
    const cell = await addLayoutCell(page, 1);

    await selectCell(cell);
    const inspector = await openCellInspector(page);
    const field = inspector.getByLabel("Visibility formula");
    await field.fill('prop("status") == ');
    await inspector.getByRole("button", { name: "Check" }).click();

    await expect(inspector.getByRole("status")).toContainText("Unexpected token");
    await expect(page.locator(".osionos-layout-cell")).toHaveCount(1);
  });
});

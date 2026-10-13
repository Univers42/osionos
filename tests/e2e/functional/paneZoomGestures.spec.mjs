/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   paneZoomGestures.spec.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 04:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 04:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Inside a zoomed pane the pointer and getBoundingClientRect speak on-screen px
// while style lengths, offsetHeight and scrollTop speak the pane's own CSS px
// (src/shared/lib/dom/cssZoom.ts). A gesture that adds one to the other is off
// by the zoom factor, and some of them save the result into the document. Each
// scenario drags a known on-screen distance at 125% and at 80% and expects the
// thing under the pointer to have moved by that distance.

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  createBlockViaSlash,
  createCodeBlock,
  createParagraphs,
  getCodeTextarea,
  openFreshPage,
  waitForRenderStability,
} from "../../browser/core/app.mjs";

const ZOOMS = [125, 80];
const PX_TOLERANCE = 2;

const zoomOf = (locator) => locator.evaluate((element) => Math.round(element.currentCSSZoom * 100));

/** A fresh page whose only pane is zoomed to `percent`, two rungs from 100%. */
async function openZoomedPage(page, baseURL, percent) {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  const key = percent > 100 ? "Control+=" : "Control+-";
  await page.keyboard.press(key);
  await page.keyboard.press(key);
  await expect.poll(() => zoomOf(editor)).toBe(percent);
  return editor;
}

/** Presses on the centre of `handle`, travels (dx, dy) on-screen px, releases. */
async function dragBy(page, handle, dx, dy) {
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
  await waitForRenderStability(page);
}

const onScreen = (locator, side) => locator.evaluate((element, key) => element.getBoundingClientRect()[key], side);

for (const percent of ZOOMS) {
  test.describe(`gestures in a pane zoomed to ${percent}%`, () => {
    test("resizing a code block moves its edge as far as the pointer", async ({ page, baseURL }) => {
      await openZoomedPage(page, baseURL, percent);
      await createCodeBlock(page);
      const source = getCodeTextarea(page);
      await source.fill(Array.from({ length: 20 }, (_, line) => `const line${line} = ${line};`).join("\n"));
      await waitForRenderStability(page);
      const handle = page.getByRole("separator", { name: "Resize code block" });
      const height = () => source.evaluate((textarea) => textarea.parentElement.getBoundingClientRect().height);

      // The block snaps to whole 24px lines; a first drag lands it on one.
      await dragBy(page, handle, 0, -30);
      const before = await height();
      // A whole number of lines that is also a whole number of on-screen px.
      const travel = (percent === 125 ? 4 : 5) * 24 * (percent / 100);
      await dragBy(page, handle, 0, -travel);

      expect(Math.abs(before - (await height()) - travel)).toBeLessThanOrEqual(PX_TOLERANCE);
    });

    test("resizing a table column and a table row follows the pointer", async ({ page, baseURL }) => {
      await openZoomedPage(page, baseURL, percent);
      await createBlockViaSlash(page, "table", "Table");
      const firstCell = page.locator("table tbody tr").first().locator("td").first();
      await firstCell.waitFor();
      const columnHandle = firstCell.locator("[data-table-handle].cursor-col-resize");
      const rowHandle = firstCell.locator("[data-table-handle].cursor-row-resize");

      // The first drag also switches the table to fixed widths; measure the second.
      await dragBy(page, columnHandle, 20, 0);
      const width = await onScreen(firstCell, "width");
      await dragBy(page, columnHandle, 60, 0);
      expect(Math.abs((await onScreen(firstCell, "width")) - width - 60)).toBeLessThanOrEqual(PX_TOLERANCE);

      await dragBy(page, rowHandle, 0, 20);
      const rowHeight = await onScreen(firstCell, "height");
      await dragBy(page, rowHandle, 0, 40);
      expect(Math.abs((await onScreen(firstCell, "height")) - rowHeight - 40)).toBeLessThanOrEqual(PX_TOLERANCE);
    });

    test("the block handle sits on the first line of a heading", async ({ page, baseURL }) => {
      const editor = await openZoomedPage(page, baseURL, percent);
      await page.keyboard.type("# A heading tall enough to show a misplaced handle");
      await waitForRenderStability(page);
      await editor.hover();
      const handle = page.locator('[data-testid="block-drag-handle"]').first();
      await expect(handle).toBeVisible();

      const offset = await handle.evaluate((button) => {
        const leaf = button.closest("article").querySelector('[contenteditable="true"]');
        const lineHeight = Number.parseFloat(getComputedStyle(leaf).lineHeight) * leaf.currentCSSZoom;
        const lineCentre = leaf.getBoundingClientRect().top + lineHeight / 2;
        const box = button.getBoundingClientRect();
        return box.top + box.height / 2 - lineCentre;
      });
      expect(Math.abs(offset)).toBeLessThanOrEqual(PX_TOLERANCE);
    });

    test("a rubber-band selection stays pinned to the page when it scrolls mid-drag", async ({ page, baseURL }) => {
      await page.setViewportSize({ width: 1280, height: 480 });
      await openZoomedPage(page, baseURL, percent);
      await createParagraphs(page, Array.from({ length: 16 }, (_, line) => `Paragraph ${line + 1}`));
      await waitForRenderStability(page);
      const scroller = page.locator(".osionos-page").first();
      await scroller.evaluate((element) => { element.scrollTop = 0; });

      const start = await scroller.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.left + 12, y: box.top + box.height / 2 };
      });
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 40, start.y + 30, { steps: 4 });
      const marquee = page.getByTestId("marquee-rect");
      await expect(marquee).toBeVisible();

      const scrolledBy = await scroller.evaluate((element) => {
        const from = element.scrollTop;
        element.scrollTop = from + 120;
        return element.scrollTop - from;
      });
      expect(scrolledBy).toBeGreaterThan(40);
      await page.mouse.move(start.x + 41, start.y + 30);

      // The anchor is a point of the page, so it went up by what the page scrolled on screen.
      const expectedTop = start.y - scrolledBy * (percent / 100);
      await expect.poll(async () => Math.abs((await onScreen(marquee, "top")) - expectedTop)).toBeLessThanOrEqual(PX_TOLERANCE);
      await page.mouse.up();
    });
  });
}

// Selectors the "Pane zoom" rule in global.css keeps at 100%.
const FIXED_SCALE = [
  ["data-osio-fixed-scale", ""],
  ["data-database-id", "db"],
  ["data-osio-ide", ""],
  ["role", "application"],
  ["data-block-type", "draw"],
  ["data-block-type", "layout"],
];

test.describe("surfaces that keep their own pixel grid", () => {
  test("stay at 100% inside a zoomed pane, nested ones included", async ({ page, baseURL }) => {
    const editor = await openZoomedPage(page, baseURL, 125);
    const zooms = await editor.evaluate((leaf, selectors) => {
      const host = leaf.closest("article").parentElement;
      const make = (parent, [name, value]) => {
        const element = document.createElement("div");
        element.setAttribute(name, value);
        element.dataset.probe = `${name}=${value}`;
        parent.append(element);
        return element;
      };
      const read = {};
      for (const selector of selectors) {
        const surface = make(host, selector);
        const inner = document.createElement("span");
        surface.append(inner);
        read[surface.dataset.probe] = [surface.currentCSSZoom, inner.currentCSSZoom];
        surface.remove();
      }
      // A database inside a layout cell: divided once, not twice.
      const layout = make(host, ["data-block-type", "layout"]);
      const cell = document.createElement("div");
      layout.append(cell);
      const nested = make(cell, ["data-database-id", "db"]);
      read.nested = [nested.currentCSSZoom, make(layout, ["data-database-id", "db"]).currentCSSZoom];
      layout.remove();
      return read;
    }, FIXED_SCALE);

    for (const [name, value] of FIXED_SCALE) expect(zooms[`${name}=${value}`], `${name}=${value}`).toEqual([1, 1]);
    expect(zooms.nested).toEqual([1, 1]);
    expect(await zoomOf(editor)).toBe(125);
  });

  test("a diagram preview stays at 100% while the code block around it is zoomed", async ({ page, baseURL }) => {
    await openZoomedPage(page, baseURL, 125);
    await createCodeBlock(page);
    await page.locator("button.font-mono").first().click();
    await page.getByRole("button", { name: "mermaid", exact: true }).click();
    const showSource = page.locator('button[title="Show source"]');
    await showSource.waitFor();

    const preview = page.locator(".osio-code-card [data-osio-fixed-scale] > *").first();
    await preview.waitFor({ state: "attached" });
    expect(await zoomOf(preview)).toBe(100);
    expect(await zoomOf(showSource)).toBe(125);
  });
});

test("a long, virtualized page keeps its blocks in place when zoomed", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  // 66 root blocks: above the virtualization threshold of 60.
  for (let line = 1; line <= 66; line += 1) {
    await page.keyboard.type(`Line ${line}`, { delay: 0 });
    if (line < 66) await page.keyboard.press("Enter");
  }
  await waitForRenderStability(page);
  expect(await page.locator("[data-block-id]").count()).toBeLessThan(66);
  const scroller = page.locator(".osionos-page").first();
  await scroller.evaluate((element) => { element.scrollTop = 0; });
  await waitForRenderStability(page);

  const line = (number) => page.getByText(`Line ${number}`, { exact: true });
  const spread = async () => (await onScreen(line(8), "top")) - (await onScreen(line(1), "top"));
  const unzoomed = await spread();

  await line(1).click();
  await page.keyboard.press("Control+=");
  await page.keyboard.press("Control+=");
  await expect.poll(() => zoomOf(line(1))).toBe(125);
  await waitForRenderStability(page);
  // Rows measured in one unit and placed in the other would drift apart by 1.25 again.
  expect(Math.abs((await spread()) - unzoomed * 1.25)).toBeLessThanOrEqual(PX_TOLERANCE);

  await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await waitForRenderStability(page);
  await expect(line(66)).toBeVisible();
  const inView = await line(66).evaluate((element) => {
    const box = element.getBoundingClientRect();
    const view = element.closest(".osionos-page").getBoundingClientRect();
    return box.top >= view.top && box.bottom <= view.bottom + 1;
  });
  expect(inView).toBe(true);
});

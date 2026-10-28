/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockDragWheel.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 23:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 23:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* global document, localStorage, sessionStorage */

// A block carried by its handle can be wheeled down the page and dropped far
// below the first screen. A native HTML5 drag swallowed the wheel on Linux.

import { expect, test } from "@playwright/test";

import { explorerRow } from "../../browser/core/app.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";
import { WS } from "../support/buttonProgramSeed.mjs";

const BLOCKS = Array.from({ length: 40 }, (_, index) => ({ id: `d${index}`, type: "paragraph", content: `Line ${index}` }));

const blockOrder = (page) =>
  page.locator('.osionos-page:has([data-block-id="d1"])').locator("article[data-draggable-block-id]").evaluateAll((articles) =>
    articles.map((article) => article.dataset.draggableBlockId));

const pageScrollTop = (page) =>
  page.locator('.osionos-page [data-block-id="d0"]').first().evaluate((el) => {
    let node = el.parentElement;
    while (node && node.scrollHeight <= node.clientHeight) node = node.parentElement;
    return node ? node.scrollTop : document.scrollingElement.scrollTop;
  });

test.beforeEach(async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await stubBridge(page, () => undefined);
  await page.addInitScript(({ ws, blocks }) => {
    if (sessionStorage.getItem("drag-seeded") !== null) return;
    sessionStorage.setItem("drag-seeded", "1");
    localStorage.setItem(`osio:pages:${ws}`, JSON.stringify([{
      _id: "drag-host", title: "Drag host", workspaceId: ws, ownerId: "mock-user-0", visibility: "private",
      collaborators: [], parentPageId: null, databaseId: null, archivedAt: null, content: blocks,
    }]));
    localStorage.setItem("pg:recents", "[]");
  }, { ws: WS, blocks: BLOCKS });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await explorerRow(page, "Drag host").click();
  await expect(page.locator('.osionos-page [data-block-id="d39"]')).toHaveCount(1);
});

test("the wheel scrolls the page while a block is carried, and the drop lands below", async ({ page }) => {
  const first = page.locator('.osionos-page article[data-draggable-block-id="d0"]');
  await first.hover();
  const handle = first.locator('> [data-testid="block-drag-handle"]');
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, 300, { steps: 4 });

  const before = await pageScrollTop(page);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => pageScrollTop(page)).toBeGreaterThan(before + 300);

  // The block in the middle of the viewport, away from the edge auto-scroll zones.
  const targetId = await page.evaluate((x) =>
    document.elementFromPoint(x, 300).closest("article[data-draggable-block-id]").dataset.draggableBlockId, box.x + 60);
  expect(Number(targetId.slice(1))).toBeGreaterThan(10);
  const targetBox = await page.locator(`.osionos-page article[data-draggable-block-id="${targetId}"]`).first().boundingBox();
  await page.mouse.move(targetBox.x + 40, targetBox.y + 3, { steps: 4 });
  await expect(page.getByTestId("block-drop-indicator")).toHaveCount(1);
  await page.mouse.up();

  await expect.poll(async () => {
    const order = await blockOrder(page);
    return order.indexOf(targetId) - order.indexOf("d0");
  }).toBe(1);
  expect((await blockOrder(page))[0]).toBe("d1");
});

test("a press without movement still opens the block menu", async ({ page }) => {
  const first = page.locator('.osionos-page article[data-draggable-block-id="d0"]');
  await first.hover();
  await first.locator('> [data-testid="block-drag-handle"]').click();
  await expect(page.getByTestId("block-context-menu")).toBeVisible();
  expect((await blockOrder(page))[0]).toBe("d0");
});

test("Escape cancels a carried block", async ({ page }) => {
  const first = page.locator('.osionos-page article[data-draggable-block-id="d0"]');
  await first.hover();
  const box = await first.locator('> [data-testid="block-drag-handle"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const target = await page.locator('.osionos-page article[data-draggable-block-id="d5"]').boundingBox();
  await page.mouse.move(target.x + 40, target.y + 3, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByTestId("block-drop-indicator")).toHaveCount(0);
  expect((await blockOrder(page))[0]).toBe("d0");
});

test("holding a carried block at the bottom edge scrolls the page", async ({ page }) => {
  const first = page.locator('.osionos-page article[data-draggable-block-id="d0"]');
  await first.hover();
  const box = await first.locator('> [data-testid="block-drag-handle"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const before = await pageScrollTop(page);
  await page.mouse.move(box.x + 40, 560, { steps: 6 });
  await expect.poll(() => pageScrollTop(page)).toBeGreaterThan(before + 200);
  await page.keyboard.press("Escape");
  await page.mouse.up();
});

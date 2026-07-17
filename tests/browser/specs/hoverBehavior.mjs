/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   hoverBehavior.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: vjan-nie <vjan-nie@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/25 00:00:00 by vjan-nie          #+#    #+#             */
/*   Updated: 2026/05/26 00:00:00 by vjan-nie         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";
import {
  createBlockViaSlash,
  getEditors,
  openFreshPage,
  pressEnter,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

async function handleOpacity(handle) {
  return handle.evaluate((el) => Number.parseFloat(getComputedStyle(el).opacity));
}

export const hoverBehaviorScenarios = [
  defineScenario(
    "6. Hover Isolation",
    "Container blocks",
    "callout children show independent handles — only the hovered child handle is visible",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "callout", "Callout");
      const first = getEditors(page).first();
      await first.type("Callout header");
      await pressEnter(first);
      await getEditors(page).last().type("Child A");
      await pressEnter(getEditors(page).last());
      await getEditors(page).last().type("Child B");

      const calloutBlock = page
        .locator('[data-testid="draggable-block"][data-block-type="callout"]')
        .first();
      const calloutHandle = calloutBlock.locator('> [data-testid="block-drag-handle"]');

      const children = page.locator('[data-parent-block-type="callout"] > li');
      const childABlock = children.nth(0).locator('[data-testid="draggable-block"]').first();
      const childBBlock = children.nth(1).locator('[data-testid="draggable-block"]').first();
      const childAHandle = childABlock.locator('> [data-testid="block-drag-handle"]');
      const childBHandle = childBBlock.locator('> [data-testid="block-drag-handle"]');

      await childABlock.hover();
      await expect.poll(() => handleOpacity(childAHandle)).toBeCloseTo(1, 1);
      await expect.poll(() => handleOpacity(calloutHandle)).toBeLessThan(0.5);
      await expect.poll(() => handleOpacity(childBHandle)).toBeLessThan(0.5);

      await childBBlock.hover();
      await expect.poll(() => handleOpacity(childBHandle)).toBeCloseTo(1, 1);
      await expect.poll(() => handleOpacity(childAHandle)).toBeLessThan(0.5);
      await expect.poll(() => handleOpacity(calloutHandle)).toBeLessThan(0.5);

      // Renamed from "Change callout icon" to "Change callout type" when the
      // button grew from a plain emoji-picker trigger into the full
      // CalloutTypePicker (src/features/block-editor/ui/BlockEditor.tsx:843).
      const icon = calloutBlock.locator('button[aria-label="Change callout type"]');
      await icon.hover();
      await expect.poll(() => handleOpacity(calloutHandle)).toBeCloseTo(1, 1);
      await expect.poll(() => handleOpacity(childAHandle)).toBeLessThan(0.5);
      await expect.poll(() => handleOpacity(childBHandle)).toBeLessThan(0.5);
    },
  ),

  defineScenario(
    "6. Hover Isolation",
    "Container blocks",
    "quote children show independent handles — only the hovered child handle is visible",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "quote", "Quote");
      const first = getEditors(page).first();
      await first.type("Quote text");
      await pressEnter(first);
      await getEditors(page).last().type("Child A");
      await pressEnter(getEditors(page).last());
      await getEditors(page).last().type("Child B");

      const quoteBlock = page
        .locator('[data-testid="draggable-block"][data-block-type="quote"]')
        .first();
      const quoteHandle = quoteBlock.locator('> [data-testid="block-drag-handle"]');

      const children = page.locator('[data-parent-block-type="quote"] > li');
      const childABlock = children.nth(0).locator('[data-testid="draggable-block"]').first();
      const childBBlock = children.nth(1).locator('[data-testid="draggable-block"]').first();
      const childAHandle = childABlock.locator('> [data-testid="block-drag-handle"]');
      const childBHandle = childBBlock.locator('> [data-testid="block-drag-handle"]');

      await childABlock.hover();
      await expect.poll(() => handleOpacity(childAHandle)).toBeCloseTo(1, 1);
      await expect.poll(() => handleOpacity(quoteHandle)).toBeLessThan(0.5);
      await expect.poll(() => handleOpacity(childBHandle)).toBeLessThan(0.5);

      await childBBlock.hover();
      await expect.poll(() => handleOpacity(childBHandle)).toBeCloseTo(1, 1);
      await expect.poll(() => handleOpacity(childAHandle)).toBeLessThan(0.5);
      await expect.poll(() => handleOpacity(quoteHandle)).toBeLessThan(0.5);
    },
  ),

  defineScenario(
    "6. Hover Isolation",
    "Regression — Task 2a heading padding",
    "hovering inside an H1 block top padding zone reveals the heading drag handle",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "h1", "Heading 1");
      const editor = getEditors(page).first();
      await editor.type("Heading one");

      const h1Block = page
        .locator('[data-testid="draggable-block"][data-block-type="heading_1"]')
        .first();
      const h1Handle = h1Block.locator('> [data-testid="block-drag-handle"]');

      const box = await h1Block.boundingBox();
      // pt-6 = 24 px; hover 10 px from the top — in the padding zone, above the text
      await page.mouse.move(box.x + box.width / 2, box.y + 10);

      await expect.poll(() => handleOpacity(h1Handle)).toBeCloseTo(1, 1);
    },
  ),

  defineScenario(
    "6. Hover Isolation",
    "Dead zones",
    "quote dead zone — hovering the accent bar shows only the quote handle, not child handles",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "quote", "Quote");
      const first = getEditors(page).first();
      await first.type("Quote text");
      await pressEnter(first);
      await getEditors(page).last().type("Child A");
      await pressEnter(getEditors(page).last());
      await getEditors(page).last().type("Child B");

      const quoteBlock = page
        .locator('[data-testid="draggable-block"][data-block-type="quote"]')
        .first();
      const quoteHandle = quoteBlock.locator('> [data-testid="block-drag-handle"]');
      const children = page.locator('[data-parent-block-type="quote"] > li');
      const childAHandle = children
        .nth(0)
        .locator('[data-testid="draggable-block"]')
        .first()
        .locator('> [data-testid="block-drag-handle"]');
      const childBHandle = children
        .nth(1)
        .locator('[data-testid="draggable-block"]')
        .first()
        .locator('> [data-testid="block-drag-handle"]');

      const quoteBox = await quoteBlock.boundingBox();
      await page.mouse.move(quoteBox.x + 2, quoteBox.y + quoteBox.height / 2);

      await expect.poll(() => handleOpacity(quoteHandle)).toBeCloseTo(1, 1);
      await expect.poll(() => handleOpacity(childAHandle)).toBeLessThan(0.5);
      await expect.poll(() => handleOpacity(childBHandle)).toBeLessThan(0.5);
    },
  ),

  defineScenario(
    "6. Hover Isolation",
    "Dead zones",
    "column_list children show independent handles — dead zone shows only the column_list handle",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "column", "2 columns");

      const colEditors = page.locator(
        '[data-parent-block-type="column"] [role="textbox"][aria-multiline="true"]',
      );
      await colEditors.nth(0).waitFor();
      await colEditors.nth(0).click();
      await page.keyboard.type("Col 1");
      await colEditors.nth(1).waitFor();
      await colEditors.nth(1).click();
      await page.keyboard.type("Col 2");

      const columnListBlock = page
        .locator('[data-testid="draggable-block"][data-block-type="column_list"]')
        .first();
      const columnListHandle = columnListBlock.locator('> [data-testid="block-drag-handle"]');

      const col1ChildBlock = columnListBlock
        .locator('[data-parent-block-type="column"]')
        .nth(0)
        .locator('> li')
        .nth(0)
        .locator('[data-testid="draggable-block"]')
        .first();
      const col2ChildBlock = columnListBlock
        .locator('[data-parent-block-type="column"]')
        .nth(1)
        .locator('> li')
        .nth(0)
        .locator('[data-testid="draggable-block"]')
        .first();
      const col1Handle = col1ChildBlock.locator('> [data-testid="block-drag-handle"]');
      const col2Handle = col2ChildBlock.locator('> [data-testid="block-drag-handle"]');

      await col1ChildBlock.hover();
      await expect.poll(() => handleOpacity(col1Handle)).toBeCloseTo(1, 1);
      await expect.poll(() => handleOpacity(col2Handle)).toBeLessThan(0.5);
      await expect.poll(() => handleOpacity(columnListHandle)).toBeLessThan(0.5);

      await col2ChildBlock.hover();
      await expect.poll(() => handleOpacity(col2Handle)).toBeCloseTo(1, 1);
      await expect.poll(() => handleOpacity(col1Handle)).toBeLessThan(0.5);
      await expect.poll(() => handleOpacity(columnListHandle)).toBeLessThan(0.5);

      const columnListBox = await columnListBlock.boundingBox();
      // y+4 lands inside the article but above any child block: my-1 (4px margin) +
      // py-2 (8px padding) on the inner wrapper puts the first child article at ~y+14.
      await page.mouse.move(columnListBox.x + columnListBox.width / 2, columnListBox.y + 4);
      await expect.poll(() => handleOpacity(columnListHandle)).toBeCloseTo(1, 1);
      await expect.poll(() => handleOpacity(col1Handle)).toBeLessThan(0.5);
      await expect.poll(() => handleOpacity(col2Handle)).toBeLessThan(0.5);
    },
  ),

  defineScenario(
    "6. Hover Isolation",
    "column_list visual",
    "column_list hover leaves the inner flex row borderless — it carries no border of its own",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "column", "2 columns");

      const columnListBlock = page
        .locator('[data-testid="draggable-block"][data-block-type="column_list"]')
        .first();
      await columnListBlock.hover();

      // The bordered-box column_list ("de86a7e", 2026-06-02: "borderless like
      // Notion; the flex row + resize handles carry the structure") replaced
      // `items-stretch` with `items-start` on the flex row
      // (BlockEditorSurface.tsx:1441) — same assertion (no border of its own),
      // current class name.
      // Assert on border-WIDTH, not border-style: Tailwind's preflight sets
      // `border-style: solid` globally with `border-width: 0`, so `borderStyle`
      // is "solid" even on an element that paints no border. Width is the
      // property that actually encodes "carries no border of its own".
      const flexBorderWidth = await columnListBlock.evaluate((article) => {
        const flexDiv = article.querySelector(".flex.items-start");
        return flexDiv ? getComputedStyle(flexDiv).borderWidth : "NOT_FOUND";
      });
      expect(flexBorderWidth).toBe("0px");
    },
  ),

  defineScenario(
    "6. Hover Isolation",
    "column_list visual",
    "column_list has no background at rest or on hover — background painting was removed project-wide",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "column", "2 columns");

      const columnListBlock = page
        .locator('[data-testid="draggable-block"][data-block-type="column_list"]')
        .first();

      // The dashed-bordered/backgrounded outer wrapper this test originally
      // targeted no longer exists: column_list dropped it entirely
      // (BlockEditor.tsx:687-696, "No outer box, so columns don't nest borders/
      // offset"). And separately, EVERY block's shared shell — not just
      // column_list's — stopped painting a hover background at all
      // (BlockEditorSurface.tsx:1258-1262: "Hover and edit-focus deliberately
      // paint NO background — a hover/focus box on every block reads as noise").
      // Current, real contract: transparent at rest AND transparent on hover.
      const readBg = () =>
        columnListBlock.evaluate((article) => getComputedStyle(article).backgroundColor);

      expect(await readBg()).toBe("rgba(0, 0, 0, 0)");

      await columnListBlock.hover();
      await expect.poll(readBg).toBe("rgba(0, 0, 0, 0)");
    },
  ),
];

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

      const icon = calloutBlock.locator('button[aria-label="Change callout icon"]');
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
    "column_list hover shows only one dashed border — the flex wrapper has no border of its own",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "column", "2 columns");

      const columnListBlock = page
        .locator('[data-testid="draggable-block"][data-block-type="column_list"]')
        .first();
      await columnListBlock.hover();

      const flexBorderStyle = await columnListBlock.evaluate((article) => {
        const flexDiv = article.querySelector(".flex.items-stretch");
        return flexDiv ? getComputedStyle(flexDiv).borderStyle : "NOT_FOUND";
      });
      expect(flexBorderStyle).toBe("none");
    },
  ),

  defineScenario(
    "6. Hover Isolation",
    "column_list visual",
    "column_list outer wrapper has no background at rest — article background appears only on hover",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "column", "2 columns");

      const columnListBlock = page
        .locator('[data-testid="draggable-block"][data-block-type="column_list"]')
        .first();

      const outerWrapperBg = await columnListBlock.evaluate((article) => {
        const wrapper = article.querySelector("[class*='border-dashed']");
        return wrapper ? getComputedStyle(wrapper).backgroundColor : null;
      });
      expect(outerWrapperBg).toBe("rgba(0, 0, 0, 0)");

      await columnListBlock.hover();
      await expect
        .poll(() =>
          columnListBlock.evaluate((article) => {
            const cs = getComputedStyle(article);
            const subtle = cs.getPropertyValue("--osio-bg-subtle").trim();
            return subtle ? cs.backgroundColor : "rgba(0, 0, 0, 0)";
          }),
        )
        .not.toBe("rgba(0, 0, 0, 0)");
    },
  ),
];

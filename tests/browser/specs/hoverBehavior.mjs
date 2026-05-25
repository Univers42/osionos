/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   hoverBehavior.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: vjan-nie <vjan-nie@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/25 00:00:00 by vjan-nie          #+#    #+#             */
/*   Updated: 2026/05/25 00:00:00 by vjan-nie         ###   ########.fr       */
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
];

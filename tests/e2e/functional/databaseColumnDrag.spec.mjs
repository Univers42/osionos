/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseColumnDrag.spec.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Table column interactions never leak into the page editor: resizing a column
// must NOT start the block marquee, and dragging a column header reorders the
// columns LIVE (the dragged header is visibly marked; columns slide as the
// pointer crosses them — no invisible drop-only reorder).

import { test, expect } from "@playwright/test";

import { addTextProperty, insertInlineDatabase } from "../support/databaseHelpers.mjs";

test.describe("database-column-drag", () => {
  test("resizing a column resizes only — no marquee, no block selection", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    const nameTh = block.locator("th", { hasText: "Name" }).first();
    const before = (await nameTh.boundingBox()).width;

    const separator = block.locator('[aria-label="Resize column"]').first();
    const box = await separator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + box.height / 2, { steps: 5 });

    // Mid-drag: the rubber-band marquee must not exist.
    await expect(page.locator('[data-testid="marquee-rect"]')).toHaveCount(0);
    await page.mouse.up();

    // No block got rubber-band selected, and the resize itself worked.
    await expect(page.locator('[data-selected="true"]')).toHaveCount(0);
    const after = (await nameTh.boundingBox()).width;
    expect(after - before).toBeGreaterThan(30);
  });

  test("dragging a column header marks the source and reorders live", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await addTextProperty(block, page);

    const nameTh = block.locator("th", { hasText: "Name" }).first();
    const textTh = block.locator("th", { hasText: "Notes" }).first();

    await textTh.dispatchEvent("dragstart");
    // The dragged column is visibly marked (the "what am I moving" indicator).
    await expect(textTh).toHaveClass(/opacity-40/);

    // Crossing the LEFT half of "Name" slides the column there — LIVE, pre-drop.
    const nameBox = await nameTh.boundingBox();
    await nameTh.dispatchEvent("dragover", {
      clientX: Math.round(nameBox.x + 4),
      clientY: Math.round(nameBox.y + 5),
    });
    await expect(block.locator("thead th").nth(1)).toContainText("Notes");
    await expect(block.locator("thead th").nth(2)).toContainText("Name");

    // Ending the drag keeps the new order and clears the source marker.
    await textTh.dispatchEvent("dragend");
    await expect(block.locator("thead th").nth(1)).toContainText("Notes");
    await expect(block.locator("th", { hasText: "Notes" }).first()).not.toHaveClass(/opacity-40/);
  });
});

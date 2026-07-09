/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   caretVirtualizedNav.spec.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/09 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/09 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test, expect } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  waitForRenderStability,
} from "../../browser/core/app.mjs";

// Regression for the "caret stuck in its own block on long pages" bug. Once a
// page crosses the root-block virtualization threshold (60), a collapsed caret
// at an element boundary — an EMPTY block, or offset 0 — reports an empty
// getClientRects() AND a degenerate getBoundingClientRect(). caretRect() then
// returned null, caretOnEdgeLine() failed closed, and vertical arrow navigation
// refused to move — while native movement can't cross the virtualizer's
// absolutely-positioned rows, so the caret was stranded. caretRect() now falls
// back to the caret container's own box, so edge detection still fires.

test.describe("caret navigation on a virtualized (long) page", () => {
  test.describe.configure({ mode: "serial" });

  test("ArrowDown crosses block boundaries including empty blocks", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();

    // 64 blocks (> 60 threshold → virtualization active); every 3rd is empty.
    for (let i = 0; i < 64; i += 1) {
      if (i % 3 !== 0) await page.keyboard.type(`text block ${i}`, { delay: 0 });
      if (i < 63) await page.keyboard.press("Enter");
    }
    await waitForRenderStability(page);

    const rendered = await page.evaluate(
      () => document.querySelectorAll("[data-block-id]").length,
    );
    // Sanity: virtualization must actually be engaged, else this guards nothing.
    expect(rendered).toBeLessThan(64);

    // Land a real caret on a rendered block, then walk down through many blocks.
    await page.locator("[data-block-id] [contenteditable]").nth(5).click();
    await waitForRenderStability(page);

    const readCaret = () =>
      page.evaluate(() => {
        const sel = document.getSelection();
        const node = sel && sel.rangeCount ? sel.anchorNode : null;
        const el = node && node.nodeType === 1 ? node : node?.parentElement;
        const block = el && el.closest ? el.closest("[data-block-id]") : null;
        const editable = block && block.querySelector("[contenteditable]");
        return {
          id: block ? block.getAttribute("data-block-id") : null,
          empty: (editable?.textContent || "").length === 0,
        };
      });

    const visited = new Set();
    let crossedAnEmptyBlock = false;
    let previous = await readCaret();
    visited.add(previous.id);

    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(40);
      const current = await readCaret();
      // The core regression: pressing ArrowDown on an EMPTY block must move on,
      // not sit stuck (empty block => element-boundary caret => empty rects).
      expect(current.id, `stuck on block ${previous.id} (empty=${previous.empty})`).not.toBe(
        previous.id,
      );
      if (previous.empty) crossedAnEmptyBlock = true;
      visited.add(current.id);
      previous = current;
    }

    // Walked through many distinct blocks and left at least one empty block.
    expect(visited.size).toBeGreaterThanOrEqual(15);
    expect(crossedAnEmptyBlock).toBe(true);
  });
});

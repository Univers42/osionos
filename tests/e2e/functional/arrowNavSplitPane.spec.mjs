/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   arrowNavSplitPane.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Regression: vertical arrow navigation must stay inside the pane that owns the
// caret. When the SAME page is open in two panes (split view), block ids are
// duplicated in the DOM; an unscoped `document.querySelector('[data-block-id]')`
// resolved the FIRST (other) pane, so ArrowUp/Down in the second pane yanked the
// caret into the first pane and it appeared "stuck". Block-nav lookups are now
// scoped to the caret's `.osionos-page`.

import { test, expect } from "@playwright/test";

import {
  activateFirstEditor,
  getEditors,
  openFreshPage,
  waitForRenderStability,
} from "../../browser/core/app.mjs";

test.describe("arrow-nav across a split of the same page", () => {
  test.describe.configure({ mode: "serial" });

  test("ArrowUp/Down in the second pane crosses blocks WITHOUT leaving the pane", async ({
    page,
    baseURL,
  }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("alpha", { delay: 0 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("bravo", { delay: 0 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("charlie", { delay: 0 });
    await waitForRenderStability(page);

    // Split right → the same page now renders in two panes (duplicate block ids).
    await page.locator('button[title="Split right"]').first().click();
    await waitForRenderStability(page);

    // Sanity: the ids really are duplicated (else this test proves nothing).
    const duplicated = await page.evaluate(() => {
      const ids = [...document.querySelectorAll("[data-block-id]")].map((e) => e.dataset.blockId);
      return ids.length > new Set(ids).size;
    });
    expect(duplicated).toBe(true);

    // Edit the RIGHT pane's "bravo" (the last matching editor), caret at end.
    const rightBravo = getEditors(page).filter({ hasText: "bravo" }).last();
    await rightBravo.click();
    await page.keyboard.press("End");
    await waitForRenderStability(page);

    const probe = () =>
      page.evaluate(() => {
        const active = document.activeElement;
        const rect = active ? active.getBoundingClientRect() : null;
        return {
          block: (active && active.closest("[data-block-id]")?.textContent) || null,
          x: rect ? Math.round(rect.left) : null,
        };
      });

    const start = await probe(); // right pane
    await page.keyboard.press("ArrowUp");
    await waitForRenderStability(page);
    const afterUp = await probe();
    await page.keyboard.press("ArrowDown");
    await waitForRenderStability(page);
    await page.keyboard.press("ArrowDown");
    await waitForRenderStability(page);
    const afterDown = await probe();

    // Crossed blocks…
    expect(afterUp.block).toBe("alpha");
    expect(afterDown.block).toBe("charlie");
    // …and never jumped panes (the bug moved x from the right pane to the left).
    expect(Math.abs(afterUp.x - start.x)).toBeLessThan(80);
    expect(Math.abs(afterDown.x - start.x)).toBeLessThan(80);
  });
});

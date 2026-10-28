/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   columnLeadAlignment.spec.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Side-by-side columns start level whatever they hold: an image beside an
// inline database sat 35 px down, a code card 60 px (measured 2026-10-28). The
// first box of every column now starts at one lead, and on a phone the columns
// stack instead of shrinking to slivers.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const IMAGE = "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22600%22%20height%3D%22800%22%3E%3Crect%20width%3D%22600%22%20height%3D%22800%22%20fill%3D%22%238a7%22%2F%3E%3C%2Fsvg%3E";
const FIRST_BLOCKS = [
  { type: "image", content: "", asset: IMAGE },
  { type: "database_inline", content: "", databaseId: "db-products", viewId: "v-prod-gallery" },
  { type: "paragraph", content: "Text" },
  { type: "heading_2", content: "Heading" },
  { type: "callout", content: "Callout" },
  { type: "code", content: "const a = 1;", language: "js" },
  { type: "quote", content: "Quote" },
  { type: "to_do", content: "Todo", checked: false },
  { type: "equation", content: "E = mc^2" },
  { type: "bookmark", content: "", url: "https://example.com" },
];

async function seedColumns(page) {
  await page.evaluate(async (blocks) => {
    const { usePageStore } = await import("/src/store/usePageStore.ts");
    const store = usePageStore.getState();
    const children = blocks.map((block, index) => ({
      id: `lead-col-${index}`,
      type: "column",
      content: "",
      children: [{ id: `lead-${block.type}`, ...block }],
    }));
    store.updatePageContent(store.activePage.id, [{ id: "lead-row", type: "column_list", content: "", children }]);
  }, FIRST_BLOCKS);
  await page.locator('[data-column-id="lead-col-9"]').waitFor();
  await page.locator('[data-column-id="lead-col-1"] .odb-topbar-row').waitFor();
}

/** Offset of each column's first box from the column's own top-left. A box is
 *  what a reader sees as the block's edge: a picture, an editable line, a
 *  filled or bordered surface, or the database title row (which has none of
 *  those). The topmost, leftmost one wins, so a wrapped toolbar below the
 *  title does not count. */
const firstBoxOffsets = (page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-column-id^="lead-col-"]')).map((column) => {
    const frame = column.getBoundingClientRect();
    const article = column.querySelector("ul > li:first-child > article");
    const boxes = Array.from(article.querySelectorAll("*")).filter((node) => {
      if (node.closest('[data-testid="block-drag-handle"]') || !node.checkVisibility({ opacityProperty: true })) return false;
      const style = getComputedStyle(node);
      return node.tagName === "IMG" || node.isContentEditable || node.matches(".odb-topbar-row")
        || style.backgroundColor !== "rgba(0, 0, 0, 0)" || parseFloat(style.borderTopWidth) > 0;
    }).map((node) => node.getBoundingClientRect()).filter((rect) => rect.height > 0);
    return {
      column: column.dataset.columnId,
      top: Math.round(Math.min(...boxes.map((rect) => rect.top)) - frame.top),
      left: Math.round(Math.min(...boxes.map((rect) => rect.left)) - frame.left),
    };
  }));

test.describe("column lead alignment", () => {
  test("every block type starts at the same top and left edge of its column", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openFreshPage(page, baseURL);
    await seedColumns(page);
    const offsets = await firstBoxOffsets(page);
    expect(offsets).toHaveLength(FIRST_BLOCKS.length);
    const [lead] = offsets;
    offsets.forEach((offset, index) => {
      expect(Math.abs(offset.top - lead.top), `${FIRST_BLOCKS[index].type} top`).toBeLessThanOrEqual(1);
      // List rows keep a 1.25rem gutter for their collapse chevron, which the
      // drag handle would otherwise overlap; they line up with each other.
      if (FIRST_BLOCKS[index].type !== "to_do") {
        expect(Math.abs(offset.left - lead.left), `${FIRST_BLOCKS[index].type} left`).toBeLessThanOrEqual(1);
      }
    });
  });

  test("at 320 px the columns stack at full width and nothing runs off the page", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openFreshPage(page, baseURL);
    await seedColumns(page);
    const layout = await page.evaluate(() => ({
      lefts: new Set(Array.from(document.querySelectorAll('[data-column-id^="lead-col-"]'), (column) => Math.round(column.getBoundingClientRect().left))).size,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }));
    expect(layout).toEqual({ lefts: 1, overflow: 0 });
  });
});

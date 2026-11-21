/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   narrowBlockWrap.spec.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Issue #327: a long unbroken word or URL in a narrow column ran out of its
// block instead of wrapping. Every block in a column squeezed to a sliver must
// keep its text inside its own box; a code block may scroll inside itself.

/* global document, getComputedStyle, NodeFilter, window -- page.evaluate bodies run in the browser */

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const WORD = "Pneumonoultramicroscopicsilicovolcanoconiosis".repeat(3);
const URL = `https://example.com/${"very-long-path-segment-".repeat(6)}end`;
const NARROW_BLOCKS = [
  { type: "paragraph", content: WORD },
  { type: "paragraph", content: `See ${URL} for details` },
  { type: "paragraph", content: `Run \`${WORD}\` first` },
  { type: "heading_2", content: WORD },
  { type: "to_do", content: WORD, checked: false },
  { type: "bulleted_list", content: URL },
  { type: "numbered_list", content: WORD },
  { type: "quote", content: WORD },
  { type: "callout", content: URL },
  { type: "toggle", content: WORD },
  { type: "code", content: `const value = "${WORD}";`, language: "js" },
];

async function seedNarrowColumn(page) {
  const storeModule = await page.evaluateHandle(() => import("/src/store/usePageStore.ts"));
  await page.waitForFunction(({ usePageStore }) => Boolean(usePageStore.getState().activePage), storeModule);
  await page.evaluate(async (blocks) => {
    const { usePageStore } = await import("/src/store/usePageStore.ts");
    const store = usePageStore.getState();
    const narrow = blocks.map((block, index) => ({ id: `narrow-${index}`, ...block }));
    const children = [
      { id: "narrow-col", type: "column", content: "", widthRatio: 0.12, children: narrow },
      { id: "wide-col", type: "column", content: "", widthRatio: 0.88, children: [{ id: "wide-text", type: "paragraph", content: "Wide" }] },
    ];
    store.updatePageContent(store.activePage.id, [{ id: "narrow-row", type: "column_list", content: "", children }]);
  }, NARROW_BLOCKS);
  await page.locator(`[data-draggable-block-id="narrow-${NARROW_BLOCKS.length - 1}"]`).waitFor();
}

/** Each block of the narrow column with text drawn past its own left or right edge. Text
 *  in a scroll box (a code block) counts as that box: scrolling inside the block is fine.
 *  Button labels are block controls, not content, and are left out. */
const overflowingBlocks = (page) => page.evaluate(() => {
  const scrollBox = (node, article) => {
    for (let el = node.parentElement; el && el !== article; el = el.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(el).overflowX)) return el;
    }
    return null;
  };
  const textRects = (article) => {
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    const rects = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || node.parentElement.closest("button")) continue;
      const box = scrollBox(node, article);
      if (box) rects.push(box.getBoundingClientRect());
      else { const range = document.createRange(); range.selectNodeContents(node); rects.push(...range.getClientRects()); }
    }
    return rects;
  };
  const articles = document.querySelectorAll('[data-column-id="narrow-col"] ul[data-parent-block-type="column"] > li > article');
  return Array.from(articles).flatMap((article) => {
    const edge = article.getBoundingClientRect();
    const rects = textRects(article);
    const spill = Math.round(Math.max(edge.left - Math.min(...rects.map((r) => r.left)), Math.max(...rects.map((r) => r.right)) - edge.right));
    return rects.length === 0 || spill > 1 ? [{ type: article.dataset.blockType, spill }] : [];
  });
});

test.describe("narrow block wrapping (#327)", () => {
  test("long words and URLs wrap inside a narrow column and nothing leaks out", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await openFreshPage(page, baseURL);
    await seedNarrowColumn(page);
    const width = await page.locator('[data-column-id="narrow-col"]').evaluate((node) => node.getBoundingClientRect().width);
    expect(width, "the column is really narrow").toBeLessThanOrEqual(140);
    expect(await overflowingBlocks(page)).toEqual([]);
    const overflow = await page.evaluate(() => ({
      row: document.querySelector(".osio-columns-row").scrollWidth - document.querySelector(".osio-columns-row").clientWidth,
      page: document.documentElement.scrollWidth - window.innerWidth,
    }));
    expect(overflow.row, "the column row does not scroll sideways").toBeLessThanOrEqual(1);
    expect(overflow.page, "the page does not scroll sideways").toBeLessThanOrEqual(0);
  });
});

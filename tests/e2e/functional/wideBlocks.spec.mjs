/* ************************************************************************** */
/*                                                                            */
/*   wideBlocks.spec.mjs                                                      */
/*                                                                            */
/*   A top-level table wider than the page's text column starts on the text   */
/*   edge, grows right into the page gutter, and only then scrolls. Nested     */
/*   blocks keep scrolling inside their own box.                               */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const COLUMN_COUNT = 12;

async function seedWideTables(page) {
  // The fresh page becomes active asynchronously on slow runners.
  await page.waitForFunction(async () => {
    const { usePageStore } = await import("/src/store/usePageStore.ts");
    return Boolean(usePageStore.getState().activePage);
  });
  await page.evaluate((columns) => {
    const table = (id, count) => {
      const header = Array.from({ length: count }, (_, index) => `Column ${index + 1}`);
      const body = Array.from({ length: count }, (_, index) => `Value ${index + 1}`);
      return {
        id,
        type: "table_block",
        content: "",
        tableData: [header, body],
        tableConfig: { headerRow: true, layoutMode: "auto", minColumnWidth: 96 },
      };
    };
    return import("/src/store/usePageStore.ts").then(({ usePageStore }) => {
      const store = usePageStore.getState();
      store.updatePageContent(store.activePage.id, [
        { id: "wide-para", type: "paragraph", content: "The text column edge" },
        table("wide-12", columns),
        { id: "wide-middle", type: "paragraph", content: "Between the tables" },
        table("wide-2", 2),
      ]);
    });
  }, COLUMN_COUNT);
  await page.locator('[data-block-id="wide-12"] table[data-table-grid]').waitFor();
  await page.locator('[data-block-id="wide-2"] table[data-table-grid]').waitFor();
}

const measure = (page) => page.evaluate(() => {
  const rect = (selector) => {
    const node = document.querySelector(selector);
    if (!node) throw new Error(`missing ${selector}`);
    return node.getBoundingClientRect();
  };
  const wide = document.querySelector('[data-block-id="wide-12"] table[data-table-grid]');
  const small = document.querySelector('[data-block-id="wide-2"] table[data-table-grid]');
  const wideScroller = wide.parentElement;
  const smallScroller = small.parentElement;
  const paragraph = rect('[data-block-id="wide-para"] [contenteditable="true"]');
  const pageScroller = document.querySelector(".osionos-page").getBoundingClientRect();
  const scrollingElement = document.scrollingElement;
  return {
    paragraphLeft: paragraph.left,
    paragraphRight: paragraph.right,
    paragraphWidth: paragraph.width,
    wideLeft: wide.getBoundingClientRect().left,
    wideScrollerRight: wideScroller.getBoundingClientRect().right,
    wideScrollWidth: wideScroller.scrollWidth,
    wideClientWidth: wideScroller.clientWidth,
    smallWidth: small.getBoundingClientRect().width,
    smallScrollerWidth: smallScroller.getBoundingClientRect().width,
    pageLeft: pageScroller.left,
    pageRight: pageScroller.right,
    pageScrollWidth: document.querySelector(".osionos-page").scrollWidth,
    pageClientWidth: document.querySelector(".osionos-page").clientWidth,
    docScrollWidth: scrollingElement.scrollWidth,
    docClientWidth: scrollingElement.clientWidth,
  };
});

test.describe("wide tables bleed to the page edge before scrolling", () => {
  test("a 12-column table grows right; a 2-column table keeps the text width", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await openFreshPage(page, baseURL);
    await seedWideTables(page);

    const metrics = await measure(page);

    // The table starts exactly on the paragraph's text edge.
    expect(Math.abs(metrics.wideLeft - metrics.paragraphLeft)).toBeLessThanOrEqual(2);

    // It is wider than the text column, yet stays inside the page scroller.
    expect(metrics.wideScrollerRight).toBeGreaterThan(metrics.paragraphRight);
    expect(metrics.wideScrollerRight).toBeLessThanOrEqual(metrics.pageRight + 1);
    expect(metrics.wideScrollerRight - metrics.paragraphRight).toBeGreaterThan(24);

    // More columns than the bleed area holds: the block itself scrolls.
    expect(metrics.wideScrollWidth).toBeGreaterThan(metrics.wideClientWidth);

    // The page never gains a horizontal scrollbar.
    expect(metrics.pageScrollWidth).toBeLessThanOrEqual(metrics.pageClientWidth);
    expect(metrics.docScrollWidth).toBeLessThanOrEqual(metrics.docClientWidth);

    // A narrow table keeps today's width: the text column's.
    expect(Math.abs(metrics.smallWidth - metrics.paragraphWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(metrics.smallScrollerWidth - metrics.paragraphWidth)).toBeLessThanOrEqual(2);
  });

  test("on a 400px page the table stays inside the page and scrolls", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 400, height: 900 });
    await openFreshPage(page, baseURL);
    await seedWideTables(page);

    const metrics = await measure(page);

    expect(Math.abs(metrics.wideLeft - metrics.paragraphLeft)).toBeLessThanOrEqual(2);
    expect(metrics.wideScrollerRight).toBeLessThanOrEqual(metrics.pageRight + 1);
    expect(metrics.pageScrollWidth).toBeLessThanOrEqual(metrics.pageClientWidth);
    expect(metrics.docScrollWidth).toBeLessThanOrEqual(metrics.docClientWidth);

    // At this width the bleed area is gone, so the block itself takes the overflow.
    expect(metrics.wideScrollWidth).toBeGreaterThan(metrics.wideClientWidth);
  });
});

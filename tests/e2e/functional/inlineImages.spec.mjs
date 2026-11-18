/* ************************************************************************** */
/*                                                                            */
/*   inlineImages.spec.mjs                                                    */
/*                                                                            */
/*   Images written inline in a paragraph (a badge row) flow on one line, as  */
/*   on GitHub. An image block keeps its own block layout.                    */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const svg = (color) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="20"><rect width="60" height="20" fill="${color}"/></svg>`,
).toString("base64");
const dataImage = (color) => `data:image/svg+xml;base64,${svg(color)}`;

const badge = (alt, color) => `[![${alt}](${dataImage(color)})](https://example.com/${alt})`;

async function seedBadgesAndImageBlock(page) {
  // Playwright does not await an async predicate: hand it the module instead.
  const storeModule = await page.evaluateHandle(() => import("/src/store/usePageStore.ts"));
  await page.waitForFunction(({ usePageStore }) => Boolean(usePageStore.getState().activePage), storeModule);
  await page.evaluate(({ storeModule: { usePageStore }, blocks }) => {
    const store = usePageStore.getState();
    store.updatePageContent(store.activePage.id, blocks);
  }, {
    storeModule,
    blocks: [
      { id: "badge-row", type: "paragraph", content: `${badge("one", "red")} ${badge("two", "blue")}` },
      { id: "plain-row", type: "paragraph", content: `![three](${dataImage("green")}) ![four](${dataImage("gray")})` },
      { id: "image-block", type: "image", content: "", asset: dataImage("black") },
    ],
  });
  await page.locator('[data-block-id="badge-row"] img').first().waitFor();
}

const measure = (page) => page.evaluate(() => {
  const tops = (id) => [...document.querySelectorAll(`[data-block-id="${id}"] [contenteditable="true"] img`)]
    .map((img) => ({ top: Math.round(img.getBoundingClientRect().top), display: getComputedStyle(img).display }));
  const block = document.querySelector('[data-block-id="image-block"] img');
  return {
    badges: tops("badge-row"),
    plain: tops("plain-row"),
    blockDisplay: block ? getComputedStyle(block).display : null,
  };
});

test.describe("inline images in a paragraph", () => {
  test("two linked badges and two bare images share one row; an image block is unchanged", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await seedBadgesAndImageBlock(page);

    const metrics = await measure(page);

    expect(metrics.badges).toHaveLength(2);
    expect(metrics.badges[0].top).toBe(metrics.badges[1].top);
    expect(metrics.plain).toHaveLength(2);
    expect(metrics.plain[0].top).toBe(metrics.plain[1].top);
    expect(metrics.blockDisplay).toBe("block");
  });
});

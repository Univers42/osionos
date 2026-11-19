/* ************************************************************************** */
/*                                                                            */
/*   blockLayoutModes.spec.mjs                                                */
/*                                                                            */
/*   With osio.layout.modes on, a column list styled as a grid lays its      */
/*   columns on tracks (a span covers two), read-only and in the editor;     */
/*   stackAt never keeps a narrow row side by side. Off, the same blocks     */
/*   are today's flex row (ADR 0064 PS6, PS10).                              */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const FLAG = "osio.layout.modes";
const para = (id, content) => ({ id, type: "paragraph", content });
const col = (id, text, style) => ({ id, type: "column", content: "", children: [para(`${id}-p`, text)], ...(style ? { style } : {}) });
const GRID = [{
  id: "grid", type: "column_list", content: "",
  style: { layout: "grid", cols: 3, minCol: 10, gap: 4 },
  children: [col("g1", "Card one", { span: 2 }), col("g2", "Card two"), col("g3", "Card three")],
}];
const rowOf = (id, style) => ({ id, type: "column_list", content: "", style, children: [col(`${id}-a`, "Left"), col(`${id}-b`, "Right")] });

async function setFlag(page, baseURL, on) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ key, on: value }) => (value ? localStorage.setItem(key, "1") : localStorage.removeItem(key)), { key: FLAG, on });
  await openFreshPage(page, baseURL);
}

async function mount(page, blocks, width) {
  const module = await page.evaluateHandle(() => import("/tests/e2e/support/mountBlocks.tsx"));
  await page.evaluate(({ module: m, blocks: b, width: w }) => m.mountBlocks(b, w), { module, blocks, width });
  return page.getByTestId("mounted-blocks");
}

async function seedEditor(page, blocks) {
  await page.waitForFunction(async () => Boolean((await import("/src/store/usePageStore.ts")).usePageStore.getState().activePage));
  await page.evaluate(async (b) => {
    const store = (await import("/src/store/usePageStore.ts")).usePageStore.getState();
    store.updatePageContent(store.activePage.id, b);
  }, blocks);
  return page.getByTestId("block-tree-root").first();
}

/** Boxes of the cards, by their text, and the display of the row holding them. */
async function cardBoxes(scope) {
  await expect(scope.getByText("Card three")).toBeVisible();
  const box = async (text) => scope.locator(".osio-columns-row > div", { hasText: text }).first().boundingBox();
  const display = await scope.locator(".osio-columns-row").first().evaluate((row) => getComputedStyle(row).display);
  return { display, one: await box("Card one"), two: await box("Card two"), three: await box("Card three") };
}

function expectGrid({ display, one, two, three }) {
  expect(display).toBe("grid");
  expect(Math.abs(one.y - two.y)).toBeLessThan(1);
  expect(three.y).toBeGreaterThan(one.y + one.height - 1);
  expect(Math.abs(one.width - (2 * two.width + 16))).toBeLessThan(2);
}

test("flag on: a grid list lays its cards on tracks, read-only and in the editor", async ({ page, baseURL }) => {
  await setFlag(page, baseURL, true);
  expectGrid(await cardBoxes(await seedEditor(page, GRID)));
  await openFreshPage(page, baseURL);
  expectGrid(await cardBoxes(await mount(page, GRID, 720)));
});

test("flag off: the same grid list is today's flex row", async ({ page, baseURL }) => {
  await setFlag(page, baseURL, false);
  const { display, one, two, three } = await cardBoxes(await mount(page, GRID, 720));
  expect(display).toBe("flex");
  expect(Math.abs(one.y - three.y)).toBeLessThan(1);
  expect(two.x).toBeGreaterThan(one.x);
});

test("flag on: below 28rem a row stacks, stackAt never keeps it side by side", async ({ page, baseURL }) => {
  await setFlag(page, baseURL, true);
  const frame = await mount(page, [rowOf("plain", { gap: 2 }), rowOf("never", { stackAt: "never" })], 360);
  await expect(frame.getByText("Right").nth(1)).toBeVisible();
  const tops = (attribute) => frame.locator(`.osio-columns-row[${attribute}] > div`).evaluateAll(
    (cells) => cells.map((cell) => cell.getBoundingClientRect().top),
  );
  const [plainLeft, plainRight] = await tops("data-s-gap");
  const [neverLeft, neverRight] = await tops("data-s-stackAt");
  expect(plainRight).toBeGreaterThan(plainLeft);
  expect(Math.abs(neverRight - neverLeft)).toBeLessThan(1);
});

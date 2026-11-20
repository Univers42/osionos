/* ************************************************************************** */
/*                                                                            */
/*   blockStyleParity.spec.mjs                                                */
/*                                                                            */
/*   Tinted, coloured and button blocks that carry no `style` look the same,  */
/*   to the pixel, with the layout-modes flag on and off, read-only and in    */
/*   the editor, in light and dark (ADR 0064 PS4, PS10).                      */
/*                                                                            */
/* ************************************************************************** */

// The shots also land in test-results/block-style-parity/ so a run on another commit can be
// compared byte for byte (the PS4 baseline was taken on the parent commit that way).
// Caveat: equal PNG bytes prove equal pixels only within one browser build; a shot from another
// Chromium differs in its text edges and is not a baseline.

import { mkdirSync, writeFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const SHOTS = "test-results/block-style-parity";
const FLAG = "osio.layout.modes";
const THEMES = ["light", "dark"];

const tint = (name, part) => `var(--osio-block-tint-${name}-${part})`;
const FIXTURE = [
  { id: "par-red", type: "paragraph", content: "Tinted text", textColor: tint("red", "fg") },
  { id: "par-blue", type: "paragraph", content: "Tinted surface", backgroundColor: tint("blue", "bg") },
  { id: "par-both", type: "paragraph", content: "Text and surface", textColor: tint("purple", "fg"), backgroundColor: tint("yellow", "bg") },
  { id: "par-hex", type: "paragraph", content: "Raw colours", textColor: "#c2410c", backgroundColor: "#fef3c7" },
  { id: "head-tint", type: "heading_2", content: "Tinted heading", textColor: tint("green", "fg"), backgroundColor: tint("gray", "bg") },
  { id: "quote-tint", type: "quote", content: "A tinted quote", backgroundColor: tint("pink", "bg") },
  { id: "callout", type: "callout", content: "A callout", backgroundColor: tint("orange", "bg") },
  { id: "btn-main", type: "button", content: "", buttonLabel: "Primary", buttonVariant: "primary" },
  { id: "btn-alt", type: "button", content: "", buttonLabel: "Secondary", buttonVariant: "secondary" },
  {
    id: "cols", type: "column_list", content: "", children: [
      { id: "col-a", type: "column", content: "", widthRatio: 0.4, children: [{ id: "col-a-p", type: "paragraph", content: "Left column" }] },
      { id: "col-b", type: "column", content: "", widthRatio: 0.6, backgroundColor: tint("brown", "bg"), children: [{ id: "col-b-p", type: "paragraph", content: "Right column", textColor: tint("red", "fg") }] },
    ],
  },
];

async function readOnlyShot(page) {
  const mount = await page.evaluateHandle(() => import("/tests/e2e/support/mountBlocks.tsx"));
  await page.evaluate(({ module, blocks }) => module.mountBlocks(blocks), { module: mount, blocks: FIXTURE });
  const frame = page.getByTestId("mounted-blocks");
  await expect(frame.getByText("Right column")).toBeVisible();
  return frame.screenshot({ animations: "disabled" });
}

async function editorShot(page) {
  const storeModule = await page.evaluateHandle(() => import("/src/store/usePageStore.ts"));
  await page.waitForFunction(({ usePageStore }) => Boolean(usePageStore.getState().activePage), storeModule);
  await page.evaluate(async (blocks) => {
    const { usePageStore } = await import("/src/store/usePageStore.ts");
    const store = usePageStore.getState();
    store.updatePageContent(store.activePage.id, blocks);
  }, FIXTURE);
  const tree = page.getByTestId("block-tree-root").first();
  await expect(tree.getByText("Right column")).toBeVisible();
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  return tree.screenshot({ animations: "disabled" });
}

async function shotsWithFlag(page, baseURL, flag) {
  await page.evaluate(({ key, value }) => (value ? localStorage.setItem(key, value) : localStorage.removeItem(key)), { key: FLAG, value: flag });
  await openFreshPage(page, baseURL);
  const editor = await editorShot(page);
  await openFreshPage(page, baseURL);
  const readOnly = await readOnlyShot(page);
  return { editor, readOnly };
}

function keep(name, png) {
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(`${SHOTS}/${name}.png`, png);
}

for (const theme of THEMES) {
  test(`blocks without style render the same with the layout flag on and off (${theme})`, async ({ page, baseURL }) => {
    await page.addInitScript((mode) => localStorage.setItem("osionos:theme-mode", mode), theme);
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    const off = await shotsWithFlag(page, baseURL, null);
    const on = await shotsWithFlag(page, baseURL, "1");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const surface of ["editor", "readOnly"]) {
      keep(`${surface}-${theme}-off`, off[surface]);
      keep(`${surface}-${theme}-on`, on[surface]);
      expect(on[surface].equals(off[surface]), `${surface} ${theme}: the flag changed pixels`).toBe(true);
    }
  });
}

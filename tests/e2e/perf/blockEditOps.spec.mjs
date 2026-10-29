/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockEditOps.spec.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// Deleting and duplicating blocks felt slow (user, 2026-10-29). This instrument times each
// repeated op keydown -> painted frame and profiles it, at a short and a long page. No budget:
// the only assertions are that the op happened (text gone, block count changed).
// Caveat: each press is awaited to paint, so a held key's OS auto-repeat (presses that queue
// behind a slow frame) is approximated by back-to-back presses, not reproduced.

import { expect, test } from "@playwright/test";

import { PERF_USE, bootApp, measureFloor, measureToPaint, writeReport } from "./perfHarness.mjs";
import { aggregateProfile, formatTop, profileDuring } from "./perfProfile.mjs";

test.use(PERF_USE);

const SPEC = "block-edit-ops";
const RUNS = 25;

// Opens an N-paragraph page through the store (one setState) and puts the caret at the end
// of the last block. Counts are read from the store: above 60 blocks the root list is
// virtualised, so a DOM count would only see the visible window.
async function openPageWithBlocks(page, count) {
  const pageId = await page.evaluate((n) => globalThis.__perfOpenBlockPage(n), count);
  const last = page.locator(`[data-block-id="${pageId}-b${count - 1}"] [role="textbox"]`);
  await expect(async () => {
    await page.evaluate(() => {
      const scroller = document.querySelector("[data-block-id]")?.closest(".osionos-page");
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
    await last.waitFor({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await focusEnd(last);
  return pageId;
}

async function focusEnd(editor) {
  await editor.click();
  await editor.page().keyboard.press("End");
}

const blockCount = (page, pageId) => page.evaluate((id) => globalThis.__perfBlockCount(id), pageId);

async function profiledCase(page, caseName, action, { floor, ...options }) {
  let toPaint = null;
  const profile = await profileDuring(page, async () => {
    toPaint = await measureToPaint(page, action, { runs: RUNS, warmups: 3, ...options });
  });
  const { totalMs, self, total } = aggregateProfile(profile);
  console.log(`\n=== ${SPEC} / ${caseName} — toPaint ${JSON.stringify(toPaint)} floor ${JSON.stringify(floor)}`);
  console.log(formatTop(self, 25));
  console.log(`--- total ms (top 35) ---`);
  console.log(formatTop(total, 35));
  writeReport(SPEC, caseName, { toPaint, floor, totalMs, selfTop: self.slice(0, 60), totalTop: total.slice(0, 80) });
  return toPaint;
}

// A handle click selects the block and opens its menu; Escape would return focus to the
// text and clear the selection, so the menu is left open and the key goes to the document.
async function selectBlock(page, blockId) {
  const block = page.locator(`[data-draggable-block-id="${blockId}"]`);
  await block.hover();
  await block.getByRole("button", { name: /Drag to reorder block/i }).first().click();
  await expect(block).toHaveAttribute("data-selected", "true");
}

test("Enter keeps the caret across the 60-block virtualisation threshold", async ({ page }) => {
  test.setTimeout(120_000);
  await bootApp(page);
  const pageId = await openPageWithBlocks(page, 55);
  for (let index = 0; index < 10; index += 1) await page.keyboard.press("Enter");
  await expect.poll(() => blockCount(page, pageId)).toBe(65);
});

for (const blocks of [40, 150]) {
  test(`Backspace on characters, ${blocks} blocks`, async ({ page }) => {
    test.setTimeout(300_000);
    await bootApp(page);
    const floor = await measureFloor(page, 10); // blurs: taken before the caret is placed
    const pageId = await openPageWithBlocks(page, blocks);
    await page.keyboard.type("x".repeat(RUNS + 3));
    await profiledCase(page, `backspaceChar.blocks${blocks}`, () => page.keyboard.press("Backspace"), { floor });
    const last = page.locator(`[data-block-id="${pageId}-b${blocks - 1}"] [role="textbox"]`);
    await expect(last).toHaveText(`Block ${blocks - 1} with some text`);
  });

  test(`Backspace removes empty blocks, ${blocks} blocks`, async ({ page }) => {
    test.setTimeout(300_000);
    await bootApp(page);
    const floor = await measureFloor(page, 10); // blurs: taken before the caret is placed
    const pageId = await openPageWithBlocks(page, blocks);
    for (let index = 0; index < RUNS + 3; index += 1) await page.keyboard.press("Enter");
    await expect.poll(() => blockCount(page, pageId)).toBe(blocks + RUNS + 3);
    await profiledCase(page, `backspaceEmptyBlock.blocks${blocks}`, () => page.keyboard.press("Backspace"), { floor });
    await expect.poll(() => blockCount(page, pageId)).toBe(blocks);
  });

  test(`Ctrl+D repeated on a selected block, ${blocks} blocks`, async ({ page }) => {
    test.setTimeout(300_000);
    await bootApp(page);
    const floor = await measureFloor(page, 10); // blurs: taken before the caret is placed
    const pageId = await openPageWithBlocks(page, blocks);
    await selectBlock(page, `${pageId}-b${blocks - 1}`);
    await profiledCase(page, `ctrlD.blocks${blocks}`, () => page.keyboard.press("Control+d"), { floor });
    await expect.poll(() => blockCount(page, pageId)).toBe(blocks + RUNS + 3);
  });

  test(`Delete on a selected block, ${blocks} blocks`, async ({ page }) => {
    test.setTimeout(300_000);
    await bootApp(page);
    const floor = await measureFloor(page, 10); // blurs: taken before the caret is placed
    const pageId = await openPageWithBlocks(page, blocks);
    let next = blocks - 1;
    await profiledCase(page, `selectDelete.blocks${blocks}`, () => page.keyboard.press("Delete"), {
      floor,
      before: async () => { await selectBlock(page, `${pageId}-b${next}`); next -= 1; },
    });
    await expect.poll(() => blockCount(page, pageId)).toBe(blocks - RUNS - 3);
  });
}

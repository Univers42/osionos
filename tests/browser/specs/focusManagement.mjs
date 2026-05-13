/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   focusManagement.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/27 10:00:13 by rstancu           #+#    #+#             */
/*   Updated: 2026/05/13 13:52:59 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  clearAndType,
  createBlockViaSlash,
  createParagraphs,
  editorHasFocus,
  focusEditorEnd,
  focusEditorStart,
  getEditors,
  openFreshPage,
  pressEnter,
  waitForRenderStability,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

function virtualBlockId(seed, index) {
  return `${seed.blockIdPrefix}${index}`;
}

async function openVirtualizedEditorPage(page, appUrl, blockCount = 90) {
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  const seed = await page.evaluate((count) => {
    if (!globalThis.__perfSeedPage) throw new Error("Perf seed helper is not exposed");
    const seeded = globalThis.__perfSeedPage(count);
    return { ...seeded, blockIdPrefix: `perf-block-${count}-` };
  }, blockCount);

  await getEditors(page).first().waitFor();
  await waitForRenderStability(page);
  return seed;
}

async function renderedVirtualBlockIndexes(page, seed) {
  return page.locator("[data-virtual-block-id]").evaluateAll((nodes, blockIdPrefix) => nodes
    .map((node) => node.dataset.virtualBlockId)
    .filter(Boolean)
    .map((id) => Number(id.startsWith(blockIdPrefix) ? id.slice(blockIdPrefix.length) : Number.NaN))
    .filter(Number.isFinite), seed.blockIdPrefix);
}

async function activeBlockId(page) {
  return page.evaluate(() => document.activeElement?.closest("[data-block-id]")?.dataset.blockId ?? null);
}

export const focusManagementScenarios = [
  defineScenario(
    "28. Focus management",
    "Enter transitions",
    "after Enter on a heading the focus moves into the new paragraph below",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const heading = await activateFirstEditor(page);
      await clearAndType(heading, "# ");
      await page.keyboard.type("Heading");
      await pressEnter(heading);
      await expect.poll(async () => editorHasFocus(getEditors(page).nth(1))).toBe(true);
    },
  ),
  defineScenario(
    "28. Focus management",
    "Delete transitions",
    "after deleting the first empty root block the focus moves to the next logical block",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Delete me", "Keep me"]);
      const first = getEditors(page).first();
      await clearAndType(first, "");
      await first.press("Delete");
      await expect(getEditors(page)).toHaveCount(1);
      await expect.poll(async () => editorHasFocus(getEditors(page).first())).toBe(true);
    },
  ),
  defineScenario(
    "28. Focus management",
    "Container transitions",
    "pressing Enter on an empty toggle summary moves focus into the newly created child",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      await getEditors(page).first().click();
      await page.keyboard.press("Enter");
      await expect(getEditors(page)).toHaveCount(2);
      await expect.poll(async () => editorHasFocus(getEditors(page).nth(1))).toBe(true);
    },
  ),
  defineScenario(
    "28. Focus management",
    "Virtualized boundaries",
    "Arrow keys scroll and focus across offscreen virtualized root blocks",
    async ({ page, appUrl }) => {
      const seed = await openVirtualizedEditorPage(page, appUrl);
      let renderedIndexes = await renderedVirtualBlockIndexes(page, seed);
      expect(renderedIndexes.length).toBeGreaterThan(0);
      expect(renderedIndexes.length).toBeLessThan(seed.blockCount);

      const lastRenderedIndex = Math.max(...renderedIndexes);
      expect(lastRenderedIndex).toBeLessThan(seed.blockCount - 1);
      await focusEditorEnd(page.locator(`[data-block-id="${virtualBlockId(seed, lastRenderedIndex)}"] [contenteditable]`));
      await page.keyboard.press("ArrowDown");
      await expect.poll(async () => activeBlockId(page)).toBe(virtualBlockId(seed, lastRenderedIndex + 1));

      await page.locator(".osionos-page").evaluate((node) => {
        node.scrollTop = Math.max(node.scrollHeight * 0.65, node.clientHeight * 2);
      });
      await waitForRenderStability(page);
      renderedIndexes = await renderedVirtualBlockIndexes(page, seed);
      const firstRenderedIndex = Math.min(...renderedIndexes);
      expect(firstRenderedIndex).toBeGreaterThan(0);
      await focusEditorStart(page.locator(`[data-block-id="${virtualBlockId(seed, firstRenderedIndex)}"] [contenteditable]`));
      await page.keyboard.press("ArrowUp");
      await expect.poll(async () => activeBlockId(page)).toBe(virtualBlockId(seed, firstRenderedIndex - 1));
    },
  ),
];

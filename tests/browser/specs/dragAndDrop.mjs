/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dragAndDrop.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/20 21:29:52 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/20 21:29:53 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  blockLocator,
  blockWrapper,
  blockOpacity,
  createParagraphs,
  dragOverBlock,
  dragBlockTo,
  endSyntheticBlockDrag,
  editorLeft,
  getEditors,
  openFreshPage,
  pressTab,
  startSyntheticBlockDrag,
  visibleBlockTexts,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

export const dragAndDropScenarios = [
  defineScenario(
    "6. Drag and Drop",
    "Same-level reorder",
    "dragging a root block above another root block reorders siblings",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["A", "B", "C"]);
      await dragBlockTo(page, 2, 0, "above");
      expect((await visibleBlockTexts(page)).slice(0, 3)).toEqual(["C", "A", "B"]);
    },
  ),
  defineScenario(
    "6. Drag and Drop",
    "Same-level reorder",
    "dragging a nested child above another nested child reorders siblings inside the same parent",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["A", "B", "C", "D"]);
      await pressTab(getEditors(page).nth(1));
      await pressTab(getEditors(page).nth(2));
      await pressTab(getEditors(page).nth(3));
      await dragBlockTo(page, 3, 1, "above");
      expect((await visibleBlockTexts(page)).slice(0, 4)).toEqual(["A", "D", "B", "C"]);
    },
  ),
  defineScenario(
    "6. Drag and Drop",
    "Cross-level moves",
    "dragging a child block below its parent at root level moves it out of the hierarchy",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["A", "B"]);
      const child = getEditors(page).nth(1);
      await pressTab(child);
      const indentedLeft = await editorLeft(child);
      await dragBlockTo(page, 1, 0, "below");
      expect((await visibleBlockTexts(page)).slice(0, 2)).toEqual(["A", "B"]);
      expect(await editorLeft(child)).toBeLessThan(indentedLeft - 8);
    },
  ),
  defineScenario(
    "6. Drag and Drop",
    "Cross-level moves",
    "dragging a child between parent groups moves it into the new parent subtree",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["A", "B", "D", "E"]);
      await pressTab(getEditors(page).nth(1));
      await pressTab(getEditors(page).nth(3));
      const targetParentLeft = await editorLeft(getEditors(page).nth(2));
      await dragBlockTo(page, 1, 3, "below");
      expect((await visibleBlockTexts(page)).slice(0, 4)).toEqual(["A", "D", "E", "B"]);
      expect(await editorLeft(getEditors(page).nth(3))).toBeGreaterThan(targetParentLeft + 8);
    },
  ),
  defineScenario(
    "6. Drag and Drop",
    "Cross-level moves",
    "dragging a parent block keeps its nested subtree together",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["A", "B", "C", "D"]);
      await pressTab(getEditors(page).nth(1));
      await pressTab(getEditors(page).nth(2));
      await pressTab(getEditors(page).nth(2));
      await dragBlockTo(page, 0, 3, "below");
      expect((await visibleBlockTexts(page)).slice(0, 4)).toEqual(["D", "A", "B", "C"]);
    },
  ),
  defineScenario(
    "6. Drag and Drop",
    "Safety checks",
    "starting a drag marks the dragged block with reduced opacity",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["A", "B"]);
      const dataTransfer = await startSyntheticBlockDrag(page, 0);
      await expect.poll(async () => blockOpacity(page, 0)).toBeLessThan(0.5);
      await endSyntheticBlockDrag(page, 0, dataTransfer);
    },
  ),
  defineScenario(
    "6. Drag and Drop",
    "Safety checks",
    "dragging over another block shows a visible drop indicator",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["A", "B"]);
      const dataTransfer = await startSyntheticBlockDrag(page, 0);
      await dragOverBlock(page, 1, dataTransfer, "above");
      await expect(blockWrapper(page, 1).getByTestId("block-drop-indicator")).toHaveCount(1);
      await endSyntheticBlockDrag(page, 0, dataTransfer);
    },
  ),
  defineScenario(
    "6. Drag and Drop",
    "Safety checks",
    "dropping a block onto itself leaves the order unchanged",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["A", "B", "C"]);
      await dragBlockTo(page, 1, 1, "above");
      expect((await visibleBlockTexts(page)).slice(0, 3)).toEqual(["A", "B", "C"]);
    },
  ),
];

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   categoryRegistry.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/20 21:29:41 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/20 21:29:42 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  clearAndType,
  createBlockViaSlash,
  createCodeBlock,
  createParagraphs,
  editorLeft,
  focusTextareaEnd,
  getEditors,
  openFreshPage,
  pressEnter,
  pressTab,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

function expectNearlyEqual(left, right, delta = 2) {
  expect(Math.abs(left - right)).toBeLessThanOrEqual(delta);
}

export const categoryRegistryScenarios = [
  defineScenario(
    "27. Block Category Registry",
    "NON_PARENTABLE",
    "blocks marked as non-parentable reject child indentation via Tab",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const parent = await activateFirstEditor(page);
      await clearAndType(parent, "# ");
      await page.keyboard.type("Heading parent");
      await pressEnter(parent);
      const child = getEditors(page).nth(1);
      await clearAndType(child, "Paragraph child");
      const before = await editorLeft(child);
      await pressTab(child);
      expectNearlyEqual(await editorLeft(child), before);
    },
  ),
  defineScenario(
    "27. Block Category Registry",
    "NON_INDENTABLE",
    "blocks marked as non-indentable keep Tab behavior local instead of structural",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createCodeBlock(page);
      const textarea = page.locator("textarea");
      await textarea.fill("const registry = true;");
      await focusTextareaEnd(textarea);
      await page.keyboard.press("Tab");
      await expect(textarea).toHaveValue("const registry = true;    ");
      await expect(getEditors(page)).toHaveCount(0);
    },
  ),
  defineScenario(
    "27. Block Category Registry",
    "enterCreatesChild",
    "blocks marked enterCreatesChild create nested children on Enter",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "callout", "Callout");
      const parent = getEditors(page).first();
      await clearAndType(parent, "Parent");
      const before = await editorLeft(parent);
      await pressEnter(parent);
      expect(await editorLeft(getEditors(page).nth(1))).toBeGreaterThan(before + 8);
    },
  ),
  defineScenario(
    "27. Block Category Registry",
    "sibling enter behavior",
    "blocks not marked enterCreatesChild create siblings rather than nested children",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "Paragraph");
      const before = await editorLeft(editor);
      await pressEnter(editor);
      expectNearlyEqual(await editorLeft(getEditors(page).nth(1)), before);
    },
  ),
];

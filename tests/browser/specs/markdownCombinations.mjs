/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   markdownCombinations.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  clearAndType,
  getEditors,
  openFreshPage,
  pressEnter,
  pressTab,
  waitForRenderStability,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

const CONTAINER = "12. Block Combinations";

/** The Tailwind size token applied to a container summary, e.g. "text-xl".
 *  (An inline font-size on the editor makes computed px unreliable, so the
 *  heading sizing is asserted via the class the renderer applies.) */
async function summarySizeClass(editor) {
  const className = await editor.evaluate((node) => node.className);
  return /\btext-(2xl|xl|lg|base|sm)\b/.exec(className)?.[1] ?? "(none)";
}

/** Whether any editor in the page currently renders the given text. */
function editorWithText(page, text) {
  return getEditors(page).filter({ hasText: text });
}

/**
 * Build a collapsible container from its markdown shortcut, then size its
 * summary like a heading via the container + "#"... combination, and type a
 * body. Returns the summary editor. Mirrors the real keystroke path.
 *   prefix: "\" " (quote) | "> " (toggle) | ">![note] " (callout)
 *   hashes: "# ".."###### "
 */
async function makeContainerHeading(page, prefix, hashes, body) {
  await activateFirstEditor(page);
  await getEditors(page).first().click();
  // A realistic per-key delay: chaining two block conversions (container then
  // heading level) needs each to commit to React state before the next key,
  // exactly as it does for a human typing.
  await page.keyboard.type(prefix, { delay: 20 });
  await waitForRenderStability(page);
  await page.keyboard.type(hashes, { delay: 20 });
  await waitForRenderStability(page);
  await page.keyboard.type(body, { delay: 15 });
  await waitForRenderStability(page);
  return getEditors(page).first();
}

export const markdownCombinationScenarios = [
  defineScenario(
    CONTAINER,
    "Container + heading level",
    'quote summary sized like a heading after quote-shortcut then "## "',
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const quote = await makeContainerHeading(page, '" ', "## ", "Big quote");
      // "## " sets heading level 2 (text-xl), keeping the quote block.
      expect(await summarySizeClass(quote)).toBe("xl");
      await expect(quote).toHaveText("Big quote");
    },
  ),
  defineScenario(
    CONTAINER,
    "Container + heading level",
    'callout summary sized like a heading after ">![note] " then "# "',
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const callout = await makeContainerHeading(page, ">![note] ", "# ", "Big callout");
      // "# " => heading level 1 (text-2xl).
      expect(await summarySizeClass(callout)).toBe("2xl");
      await expect(callout).toHaveText("Big callout");
    },
  ),
  defineScenario(
    CONTAINER,
    "Container + heading level",
    'toggle summary sized like a heading after "> " then "## "',
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const toggle = await makeContainerHeading(page, "> ", "## ", "Big toggle");
      expect(await summarySizeClass(toggle)).toBe("xl");
      await expect(toggle).toHaveText("Big toggle");
    },
  ),
  defineScenario(
    CONTAINER,
    "Collapsible list",
    "a bulleted item with a nested child collapses and re-expands",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "- Parent item");
      await pressEnter(editor);
      await pressTab(getEditors(page).nth(1));
      await clearAndType(getEditors(page).nth(1), "Nested child");
      await waitForRenderStability(page);

      await expect(editorWithText(page, "Nested child")).toHaveCount(1);
      const chevron = page.locator("[data-list-collapse]").first();
      await expect(chevron).toHaveCount(1);

      await chevron.click({ force: true });
      await waitForRenderStability(page);
      await expect(editorWithText(page, "Nested child")).toHaveCount(0);

      await chevron.click({ force: true });
      await waitForRenderStability(page);
      await expect(editorWithText(page, "Nested child")).toHaveCount(1);
    },
  ),
];

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   containersAndPaste.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/20 21:29:45 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/27 08:45:06 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  blockLocatorForEditor,
  clearAndType,
  contextMenuItem,
  createBlockViaSlash,
  editorLeft,
  getCodeTextarea,
  getEditors,
  openBlockContextMenuForEditor,
  openFreshPage,
  openSlashMenuFromEditor,
  pasteText,
  pressEnter,
  pressTab,
  slashMenu,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

function toggleChevron(page) {
  return page
    .locator("[data-block-id]")
    .first()
    .locator('button:not([title="Drag to reorder"])')
    .first();
}

export const containerAndPasteScenarios = [
  defineScenario(
    "7. Toggle Block",
    "Basic toggle behavior",
    "an empty expanded toggle shows the Empty toggle hint",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      await expect(page.getByText("Empty toggle")).toBeVisible();
      await expect(getEditors(page)).toHaveCount(1);
    },
  ),
  defineScenario(
    "7. Toggle Block",
    "Basic toggle behavior",
    "clicking the chevron collapses and re-expands toggle children without losing them",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      const summary = getEditors(page).first();
      await clearAndType(summary, "Summary");
      await pressEnter(summary);
      const child = getEditors(page).nth(1);
      await clearAndType(child, "Nested child");
      await toggleChevron(page).click();
      await expect(getEditors(page)).toHaveCount(1);
      await toggleChevron(page).click();
      await expect(getEditors(page)).toHaveCount(2);
      await expect(getEditors(page).nth(1)).toHaveText("Nested child");
    },
  ),
  defineScenario(
    "7. Toggle Block",
    "Toggle children as full blocks",
    "the slash menu works inside a toggle child",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      const summary = getEditors(page).first();
      await clearAndType(summary, "Summary");
      await pressEnter(summary);
      const child = getEditors(page).nth(1);
      await child.waitFor();
      await openSlashMenuFromEditor(child, "/");
      await expect(slashMenu(page)).toContainText("Heading");
    },
  ),
  defineScenario(
    "7. Toggle Block",
    "Toggle children as full blocks",
    "markdown shortcuts still work inside a toggle child",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      const summary = getEditors(page).first();
      await clearAndType(summary, "Summary");
      await pressEnter(summary);
      const child = getEditors(page).nth(1);
      await clearAndType(child, "- ");
      await page.keyboard.type("Nested bullet");
      await expect(page.locator(".inline-block.w-1\\.5.h-1\\.5")).toHaveCount(1);
    },
  ),
  defineScenario(
    "7. Toggle Block",
    "Toggle children as full blocks",
    "Tab indents one toggle child under another inside the toggle tree",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      const summary = getEditors(page).first();
      await clearAndType(summary, "Summary");
      await pressEnter(summary);
      const firstChild = getEditors(page).nth(1);
      await clearAndType(firstChild, "A");
      await pressEnter(firstChild);
      const secondChild = getEditors(page).nth(2);
      await clearAndType(secondChild, "B");
      const before = await editorLeft(secondChild);
      await pressTab(secondChild);
      expect(await editorLeft(secondChild)).toBeGreaterThan(before + 8);
    },
  ),
  defineScenario(
    "7. Toggle Block",
    "Toggle + external interactions",
    "a root block can be moved into a collapsed toggle and remains hidden until the toggle is expanded",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      await page.keyboard.type("Toggle summary");
      const summary = getEditors(page).first();
      await openBlockContextMenuForEditor(summary);
      await contextMenuItem(page, "Insert text below").click();
      const child = getEditors(page).nth(1);
      await clearAndType(child, "Hidden child");
      await toggleChevron(page).click();
      await pressTab(child);
      await expect(getEditors(page)).toHaveCount(1);
      await toggleChevron(page).click();
      await expect(getEditors(page)).toHaveCount(2);
      await expect(getEditors(page).nth(1)).toHaveText("Hidden child");
    },
  ),
  defineScenario(
    "7. Toggle Block",
    "Toggle + external interactions",
    "deleting an empty toggle summary promotes its child blocks to the parent level",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      const summary = getEditors(page).first();
      await clearAndType(summary, "Summary");
      await pressEnter(summary);
      const child = getEditors(page).nth(1);
      await clearAndType(child, "Promoted child");
      const childLeft = await editorLeft(child);
      await clearAndType(summary, "");
      await summary.press("Backspace");
      await expect(getEditors(page)).toHaveCount(1);
      await expect(getEditors(page).first()).toHaveText("Promoted child");
      expect(await editorLeft(getEditors(page).first())).toBeLessThan(
        childLeft - 8,
      );
    },
  ),
  defineScenario(
    "8. Callout & Quote as Containers",
    "Callout",
    "callout children are rendered inside the callout box",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "callout", "Callout");
      const callout = getEditors(page).first();
      await clearAndType(callout, "Callout");
      await pressEnter(callout);
      const child = getEditors(page).nth(1);
      await clearAndType(child, "Nested inside callout");
      await expect(
        blockLocatorForEditor(callout).locator("[data-block-id]"),
      ).toContainText(["Nested inside callout"]);
    },
  ),
  defineScenario(
    "8. Callout & Quote as Containers",
    "Callout",
    "indenting a paragraph under a callout renders it as a child inside the container",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "callout", "Callout");
      const callout = getEditors(page).first();
      await clearAndType(callout, "Callout");
      await pressEnter(callout);
      const child = getEditors(page).nth(1);
      expect(await editorLeft(child)).toBeGreaterThan(
        (await editorLeft(callout)) + 8,
      );
    },
  ),
  defineScenario(
    "8. Callout & Quote as Containers",
    "Callout",
    "slash menu commands work inside callout children",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "callout", "Callout");
      const callout = getEditors(page).first();
      await clearAndType(callout, "Callout");
      await pressEnter(callout);
      const child = getEditors(page).nth(1);
      await child.waitFor();
      await openSlashMenuFromEditor(child, "/");
      await expect(slashMenu(page)).toContainText("Heading");
    },
  ),
  defineScenario(
    "8. Callout & Quote as Containers",
    "Callout",
    "deleting an empty callout keeps nested grandchildren under their promoted parent",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "callout", "Callout");
      const callout = getEditors(page).first();
      await clearAndType(callout, "Callout");
      await pressEnter(callout);
      const parentChild = getEditors(page).nth(1);
      await clearAndType(parentChild, "Parent child");
      await pressEnter(parentChild);
      const secondChild = getEditors(page).nth(2);
      await clearAndType(secondChild, "Grandchild");
      await pressTab(secondChild);
      const parentChildLeftBefore = await editorLeft(parentChild);
      const nestedLeftBefore = await editorLeft(secondChild);
      await clearAndType(callout, "");
      await callout.press("Backspace");
      const promotedParent = getEditors(page).first();
      const promotedGrandchild = getEditors(page).nth(1);
      await expect(promotedParent).toHaveText("Parent child");
      await expect(promotedGrandchild).toHaveText("Grandchild");
      const nestedOffsetBefore = nestedLeftBefore - parentChildLeftBefore;
      const promotedParentLeft = await editorLeft(promotedParent);
      const promotedGrandchildLeft = await editorLeft(promotedGrandchild);
      expect(promotedGrandchildLeft).toBeGreaterThan(promotedParentLeft + 8);
      expect(promotedGrandchildLeft - promotedParentLeft).toBeGreaterThan(
        nestedOffsetBefore - 4,
      );
    },
  ),
  defineScenario(
    "8. Callout & Quote as Containers",
    "Callout",
    "deleting an empty callout promotes its children instead of deleting their content",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "callout", "Callout");
      const callout = getEditors(page).first();
      await clearAndType(callout, "Callout");
      await pressEnter(callout);
      const child = getEditors(page).nth(1);
      await clearAndType(child, "Promoted child");
      const childLeft = await editorLeft(child);
      await clearAndType(callout, "");
      await callout.press("Backspace");
      await expect(getEditors(page)).toHaveCount(1);
      await expect(getEditors(page).first()).toHaveText("Promoted child");
      expect(await editorLeft(getEditors(page).first())).toBeLessThan(
        childLeft - 8,
      );
    },
  ),
  defineScenario(
    "8. Callout & Quote as Containers",
    "Quote",
    "quote children are rendered inside the quote branch",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "quote", "Quote");
      const quote = getEditors(page).first();
      await clearAndType(quote, "Quote");
      await pressEnter(quote);
      const child = getEditors(page).nth(1);
      await clearAndType(child, "Nested inside quote");
      await expect(
        blockLocatorForEditor(quote).locator("[data-block-id]"),
      ).toContainText(["Nested inside quote"]);
    },
  ),
  defineScenario(
    "8. Callout & Quote as Containers",
    "Quote",
    "a quote can contain multiple child blocks rendered inside the quote branch",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "quote", "Quote");
      const quote = getEditors(page).first();
      await clearAndType(quote, "Quote");
      await pressEnter(quote);
      const firstChild = getEditors(page).nth(1);
      await clearAndType(firstChild, "Child 1");
      await pressEnter(firstChild);
      const secondChild = getEditors(page).nth(2);
      await clearAndType(secondChild, "Child 2");
      const quoteLeft = await editorLeft(quote);
      expect(await editorLeft(firstChild)).toBeGreaterThan(quoteLeft + 8);
      expect(await editorLeft(secondChild)).toBeGreaterThan(quoteLeft + 8);
      await expect(getEditors(page)).toHaveCount(3);
    },
  ),
  defineScenario(
    "8. Callout & Quote as Containers",
    "Quote",
    "deleting an empty quote promotes its children according to editor rules",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "quote", "Quote");
      const quote = getEditors(page).first();
      await clearAndType(quote, "Quote");
      await pressEnter(quote);
      const child = getEditors(page).nth(1);
      await clearAndType(child, "Promoted quote child");
      const childLeft = await editorLeft(child);
      await clearAndType(quote, "");
      await quote.press("Backspace");
      await expect(getEditors(page)).toHaveCount(1);
      await expect(getEditors(page).first()).toHaveText("Promoted quote child");
      expect(await editorLeft(getEditors(page).first())).toBeLessThan(
        childLeft - 8,
      );
    },
  ),
  defineScenario(
    "10. Paste Handling",
    "Paste handling",
    "pasting multiline markdown creates multiple corresponding blocks",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await pasteText(editor, "# Title\n\nParagraph\n\n- Item");
      await expect(getEditors(page)).toHaveCount(3);
      await expect(getEditors(page).first()).toHaveText("Title");
      await expect(page.locator(".inline-block.w-1\\.5.h-1\\.5")).toHaveCount(1);
    },
    { serial: true },
  ),
  defineScenario(
    "10. Paste Handling",
    "Paste handling",
    "pasting a fenced code block creates a code block with the pasted content",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await pasteText(editor, "```js\nconsole.log(1)\n```");
      await expect(getCodeTextarea(page)).toBeVisible();
      await expect(getCodeTextarea(page)).toHaveValue("console.log(1)");
    },
    { serial: true },
  ),
  defineScenario(
    "10. Paste Handling",
    "Paste handling",
    "pasting heading levels 4-6 preserves each heading level style",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await pasteText(
        editor,
        "#### Heading 4\n##### Heading 5\n###### Heading 6",
      );

      const editors = getEditors(page);
      await expect(editors).toHaveCount(3);
      await expect(editors.nth(0)).toHaveText("Heading 4");
      await expect(editors.nth(1)).toHaveText("Heading 5");
      await expect(editors.nth(2)).toHaveText("Heading 6");

      await expect(editors.nth(0)).toHaveClass(/text-base/);
      await expect(editors.nth(1)).toHaveClass(/text-sm/);
      await expect(editors.nth(2)).toHaveClass(/text-xs/);
    },
    { serial: true },
  ),
  defineScenario(
    "10. Paste Handling",
    "Paste handling",
    "pasting a single short line keeps it as inline text in the current block",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await pasteText(editor, "Single line paste");
      await expect(getEditors(page)).toHaveCount(1);
      await expect(editor).toHaveText("Single line paste");
    },
    { serial: true },
  ),
];

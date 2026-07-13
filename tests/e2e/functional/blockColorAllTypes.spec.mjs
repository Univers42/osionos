/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockColorAllTypes.spec.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// "/color <name>" tints the whole block's TEXT (block.textColor); "/background
// <name>" tints its SURFACE (block.backgroundColor). Both take a direct colour
// arg and both must work on every block SHAPE — a bare editable (paragraph), a
// marker-wrapped list item (bulleted_list) and a sub-component (toggle).

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

const RED = "rgb(239, 68, 68)"; // resolveColorName("red") -> #ef4444

// Blocks are created through the SLASH MENU, not a markdown shortcut ("- ", "> "):
// the shortcut path has a separate, pre-existing race that can strand the marker
// in the block ("hello-"), which is orthogonal to what this spec covers.
const SHAPES = [
  { create: null, type: "paragraph" }, // bare EditableContent
  { create: "Bulleted list", type: "bulleted_list" }, // marker + wrapped EditableContent
  { create: "Toggle list", type: "toggle" }, // sub-component (ToggleBlockEditor)
];

async function makeBlock(page, create) {
  const editor = await activateFirstEditor(page);
  await editor.click();
  if (create) {
    await page.keyboard.type(`/${create}`);
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
  }
  await page.keyboard.type("hello");
  await page.waitForTimeout(200);
}

async function runSlash(page, command) {
  await page.keyboard.type(command);
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
}

/** Computed style of a block: `where` = "text" (the editable) or "surface" (wrapper). */
async function blockStyle(page, type, where) {
  return page.evaluate(
    ({ t, w }) => {
      const wrapper = document.querySelector(
        `.osionos-page [data-block-id][data-block-type="${t}"]`,
      );
      if (!wrapper) return null;
      if (w === "surface") return getComputedStyle(wrapper).backgroundColor;
      const ce = wrapper.querySelector("[contenteditable]");
      return ce ? getComputedStyle(ce).color : null;
    },
    { t: type, w: where },
  );
}

test.describe("whole-block /color and /background take a colour arg on every block shape", () => {
  for (const { create, type } of SHAPES) {
    test(`${type}: /color red tints the text`, async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      await makeBlock(page, create);
      await runSlash(page, "/color red");
      expect(await blockStyle(page, type, "text")).toBe(RED);
    });

    test(`${type}: /background red tints the surface`, async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      await makeBlock(page, create);
      await runSlash(page, "/background red");
      expect(await blockStyle(page, type, "surface")).toBe(RED);
    });
  }
});

// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   alphaOrderedList.spec.mjs                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/11/21 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/11/21 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// Lettered ordered lists (#328 AL13, AL3): "a." + Space starts a. b. c., the
// numeric "1." shortcut is unchanged, and one Ctrl+Z after either conversion
// does the same thing. Waits two frames after a conversion: the editor commits
// the new block type asynchronously, and a person never types inside that window.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

const settle = (page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

const markers = (page) => page.locator('[data-block-type="numbered_list"] [data-list-marker]').allTextContents();

async function startList(page, baseURL, trigger) {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type(trigger);
  await page.keyboard.press(" ");
  await settle(page);
}

/** What the page looks like after one Ctrl+Z, with the trigger's own digit or letter neutralised. */
async function afterOneUndo(page, trigger) {
  await page.keyboard.press("ControlOrMeta+z");
  await settle(page);
  const listItems = (await markers(page)).length;
  const paragraphs = await page.locator('[data-block-type="paragraph"] [contenteditable]').allTextContents();
  return { listItems, paragraphs: paragraphs.map((text) => text.replace(trigger, "<trigger>")) };
}

test.describe("lettered ordered list", () => {
  test("a. + Space starts a lettered list and Enter continues it; 1. stays numeric", async ({ page, baseURL }) => {
    await startList(page, baseURL, "a.");
    await page.keyboard.type("x");
    await page.keyboard.press("Enter");
    await page.keyboard.type("y");
    await expect.poll(() => markers(page)).toEqual(["a.", "b."]);

    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await settle(page);
    await page.keyboard.type("1.");
    await page.keyboard.press(" ");
    await settle(page);
    await page.keyboard.type("z");
    await expect.poll(() => markers(page)).toEqual(["a.", "b.", "1."]);
  });

  test("one Ctrl+Z after a. + Space does what it does after 1. + Space", async ({ page, baseURL }) => {
    await startList(page, baseURL, "1.");
    await expect.poll(() => markers(page)).toEqual(["1."]);
    const numeric = await afterOneUndo(page, "1.");

    await startList(page, baseURL, "a.");
    await expect.poll(() => markers(page)).toEqual(["a."]);
    const lettered = await afterOneUndo(page, "a.");

    test.info().annotations.push({ type: "undo-outcome", description: JSON.stringify({ numeric, lettered }) });
    expect(lettered).toEqual(numeric);
  });
});

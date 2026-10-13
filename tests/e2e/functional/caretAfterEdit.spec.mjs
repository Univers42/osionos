// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   caretAfterEdit.spec.mjs                            :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// Where the caret lands after an edit the editor performs for the user. Each case waits two
// frames before typing: the editor places the caret asynchronously (rAF / setTimeout 0), and a
// person never types inside that window, so typing earlier would test the race, not the result.
// (The caretVoidBlockNav "tall inline page chip" case flaked on exactly this: the chip insert
// parked the caret at the block start, so the next Enter split above the chip.)

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

/** The [data-block-id] block that owns the live selection caret. */
async function caretBlockText(page) {
  return page.evaluate(() => {
    const sel = globalThis.getSelection();
    const anchor = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
    const el = anchor ? (anchor.nodeType === 1 ? anchor : anchor.parentElement) : null;
    return el?.closest("[data-block-id]")?.textContent ?? null;
  });
}

const settle = (page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

test.describe("caret after an editor edit", () => {
  test("typing after a [[page]] chip continues after the chip", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("see ");
    await page.keyboard.type("[[");
    await page.getByText("Link to page").waitFor();
    await page.keyboard.press("Enter");
    await expect(page.locator("span[data-page-id]").first()).toBeVisible();
    await settle(page);
    await page.keyboard.type("Z");
    await expect.poll(() => caretBlockText(page)).toMatch(/^see .+Z\s*$/);
  });

  test("Backspace at the start of a paragraph merges it and leaves the caret at the seam", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("first");
    await page.keyboard.press("Enter");
    await page.keyboard.type("second");
    await page.keyboard.press("Home");
    await page.keyboard.press("Backspace");
    await expect.poll(() => caretBlockText(page)).toBe("firstsecond");
    await settle(page);
    await page.keyboard.type("|");
    await expect.poll(() => caretBlockText(page)).toBe("first|second");
  });
});

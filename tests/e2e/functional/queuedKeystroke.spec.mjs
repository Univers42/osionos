// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   queuedKeystroke.spec.mjs                           :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// An editable batches keystrokes into one change per animation frame. A keystroke typed in the
// same frame as an Enter that a menu takes is still in that batch when the menu rewrites the
// block; when the frame then fires, the stale batch must not write the old text back.
// (blockCreation "pressing Enter on /quote" failed 6/10 runs that way on 2026-10-13: the slash
// menu takes Enter in the capture phase, so the editable's own keydown flush never ran.)
// The frame is held explicitly so the case is deterministic instead of timing-dependent.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, blockLocatorForEditor, openFreshPage, slashMenu } from "../../browser/core/app.mjs";

/** Queue every requestAnimationFrame callback until releaseFrames(). */
async function holdFrames(page) {
  await page.evaluate(() => {
    const held = new Map();
    let nextId = 1;
    const realRequest = globalThis.requestAnimationFrame;
    const realCancel = globalThis.cancelAnimationFrame;
    // Negative ids never collide with the browser's own (positive) frame ids.
    globalThis.requestAnimationFrame = (callback) => {
      const id = -nextId;
      nextId += 1;
      held.set(id, callback);
      return id;
    };
    globalThis.cancelAnimationFrame = (id) => {
      if (!held.delete(id)) realCancel(id);
    };
    globalThis.__releaseFrames = () => {
      globalThis.requestAnimationFrame = realRequest;
      globalThis.cancelAnimationFrame = realCancel;
      const now = globalThis.performance.now();
      for (const callback of held.values()) callback(now);
      held.clear();
    };
  });
}

const settle = (page) =>
  page.evaluate(() => new Promise((resolve) => {
    globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve));
  }));

test.describe("a keystroke queued for the next frame", () => {
  test("is not written back after Enter picks a slash command", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("/quot");
    await slashMenu(page).getByTestId("slash-command-entry").filter({ hasText: /quote/i }).first().waitFor();
    await settle(page);

    await holdFrames(page);
    await page.keyboard.type("e");
    await page.keyboard.press("Enter");
    await page.evaluate(() => globalThis.__releaseFrames());
    await settle(page);

    await expect(blockLocatorForEditor(editor)).toHaveAttribute("data-block-type", "quote");
    await expect(editor).toHaveText("");
  });
});

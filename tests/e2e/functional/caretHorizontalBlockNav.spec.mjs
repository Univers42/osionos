/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   caretHorizontalBlockNav.spec.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/11 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/11 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test, expect } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  waitForRenderStability,
} from "../../browser/core/app.mjs";

// Reading flow is left-to-right: ArrowRight at the END of a block must continue
// into the next block's start, and ArrowLeft at the START must continue into the
// previous block's end — the caret must not be trapped at a block edge.

async function caretBlockId(page) {
  return page.evaluate(() => {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const node = sel.getRangeAt(0).startContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    const block = el && el.closest ? el.closest("[data-block-id]") : null;
    return block ? block.getAttribute("data-block-id") : null;
  });
}

async function setCaretAtOffset(page, blockId, offset) {
  return page.evaluate(
    ({ id, off }) => {
      const block = document.querySelector(`[data-block-id="${id}"]`);
      const editable = block && block.querySelector("[contenteditable]");
      if (!editable) return false;
      const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
      const textNode = walker.nextNode();
      const range = document.createRange();
      if (textNode) {
        range.setStart(textNode, Math.min(off, textNode.textContent.length));
      } else {
        range.selectNodeContents(editable);
      }
      range.collapse(true);
      editable.focus();
      const sel = document.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    },
    { id: blockId, off: offset },
  );
}

async function blockIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-block-id]")).map((el) =>
      el.getAttribute("data-block-id"),
    ),
  );
}

test.describe("caret horizontal block crossing", () => {
  test.describe.configure({ mode: "serial" });

  async function twoBlocks(page, baseURL) {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("First block content", { delay: 0 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second block content", { delay: 0 });
    await waitForRenderStability(page);
    return blockIds(page);
  }

  test("ArrowRight at end of a block enters the next block", async ({ page, baseURL }) => {
    const ids = await twoBlocks(page, baseURL);
    await setCaretAtOffset(page, ids[0], 9999); // end of block 1
    await waitForRenderStability(page);
    expect(await caretBlockId(page)).toBe(ids[0]);

    await page.keyboard.press("ArrowRight");
    await waitForRenderStability(page);
    expect(await caretBlockId(page)).toBe(ids[1]);
  });

  test("ArrowLeft at start of a block enters the previous block", async ({ page, baseURL }) => {
    const ids = await twoBlocks(page, baseURL);
    await setCaretAtOffset(page, ids[1], 0); // start of block 2
    await waitForRenderStability(page);
    expect(await caretBlockId(page)).toBe(ids[1]);

    await page.keyboard.press("ArrowLeft");
    await waitForRenderStability(page);
    expect(await caretBlockId(page)).toBe(ids[0]);
  });
});

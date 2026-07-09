/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   caretVisualLineNav.spec.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test, expect } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  waitForRenderStability,
} from "../../browser/core/app.mjs";

// Regression for the "ArrowUp/Down jumps block-to-block on multi-line/wrapped
// blocks" bug: the caret must step visual-line by visual-line WITHIN a wrapped
// block before leaving it, and the horizontal column must survive a boundary
// crossing. Neither was covered before this spec.

async function caretInfo(page) {
  return page.evaluate(() => {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const rects = range.getClientRects();
    const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    const node = range.startContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    const block = el && el.closest ? el.closest("[data-block-id]") : null;
    return {
      blockId: block ? block.getAttribute("data-block-id") : null,
      top: rect.top,
      left: rect.left,
    };
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
        range.collapse(true);
      } else {
        range.selectNodeContents(editable);
        range.collapse(true);
      }
      editable.focus();
      const sel = document.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    },
    { id: blockId, off: offset },
  );
}

async function firstBlockId(editor) {
  return editor.evaluate((node) =>
    node.closest("[data-block-id]")?.getAttribute("data-block-id"),
  );
}

// A paragraph long enough to soft-wrap to several visual lines at any column.
const WRAPPING_TEXT = "Lorem ipsum dolor sit amet consectetur adipiscing elit ".repeat(9);

test.describe("caret visual-line navigation in wrapped blocks", () => {
  test.describe.configure({ mode: "serial" });

  test("ArrowDown steps line-by-line inside a wrapped block before leaving it", async ({
    page,
    baseURL,
  }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type(WRAPPING_TEXT, { delay: 0 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second block sentinel", { delay: 0 });
    await waitForRenderStability(page);

    const blockId = await firstBlockId(editor);
    await setCaretAtOffset(page, blockId, 0);
    await waitForRenderStability(page);

    let previous = await caretInfo(page);
    let stepsInsideBlock = 0;
    let leftBlock = false;
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press("ArrowDown");
      await waitForRenderStability(page);
      const current = await caretInfo(page);
      if (current.blockId !== blockId) {
        leftBlock = true;
        break;
      }
      // Still inside block 1: the caret must have moved DOWN a visual line, not
      // stayed put (never-move) or bounced up.
      expect(current.top).toBeGreaterThan(previous.top - 1);
      stepsInsideBlock += 1;
      previous = current;
    }

    expect(leftBlock).toBe(true);
    // The core regression: the old fail-open jumped to block 2 on the very first
    // press (0 in-block steps). The fix steps through the wrapped lines first.
    expect(stepsInsideBlock).toBeGreaterThanOrEqual(2);
  });

  test("the horizontal column is preserved when crossing a block boundary", async ({
    page,
    baseURL,
  }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type(WRAPPING_TEXT, { delay: 0 });
    await page.keyboard.press("Enter");
    await page.keyboard.type(
      "Second paragraph also reasonably long so the caret column lands on real text",
      { delay: 0 },
    );
    await waitForRenderStability(page);

    const blockId = await firstBlockId(editor);
    await setCaretAtOffset(page, blockId, 22);
    await waitForRenderStability(page);
    const start = await caretInfo(page);

    let current = start;
    for (let i = 0; i < 24; i += 1) {
      await page.keyboard.press("ArrowDown");
      await waitForRenderStability(page);
      current = await caretInfo(page);
      if (current.blockId !== blockId) break;
    }

    expect(current.blockId).not.toBe(blockId);
    // Column drifts at most ~one character across the crossing.
    expect(Math.abs(current.left - start.left)).toBeLessThanOrEqual(20);
  });
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   trailingBlankLines.spec.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Issue #329: pressing Enter again and again at the end of a long page made the
// view jump, every few presses, so the caret landed mid-screen instead of being
// followed line by line at the bottom edge. Each new blank line must hold the
// caret, sit inside the view, and scroll the page by about one line at most.
// The page crosses the 60-block virtualization threshold on the way.

/* global document, getSelection */

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

const TEXT_LINES = 25;
const BLANK_LINES = 40;

/** Where the caret is: its root block's index, whether the selection sits in
 *  the focused editor, the editor's box, and the page's scroll offset. */
const caretState = (page) => page.evaluate(() => {
  const active = document.activeElement;
  const root = document.querySelector('.osionos-page [data-testid="block-tree-root"]');
  const items = root ? Array.from(root.children) : [];
  const item = items.find((li) => li.contains(active));
  const scroller = root?.closest(".osionos-page");
  const anchor = getSelection()?.anchorNode;
  const box = active.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  return {
    index: item ? Number(item.dataset.index ?? items.indexOf(item)) : -1,
    caretInEditor: Boolean(anchor && active.isContentEditable && active.contains(anchor)),
    top: box.top, bottom: box.bottom, height: box.height,
    viewTop: view.top, viewBottom: view.bottom, scrollTop: scroller.scrollTop,
  };
});

async function typeTextLines(page, count) {
  const editor = await activateFirstEditor(page);
  await editor.click();
  for (let line = 0; line < count; line += 1) {
    await page.keyboard.type(`Line ${line} with some text`);
    await page.keyboard.press("Enter");
  }
}

function expectFollowed(state, previous, expectedIndex) {
  expect(state.index, "the caret is in the newest, last block").toBe(expectedIndex);
  expect(state.caretInEditor, "the selection is inside that block").toBe(true);
  expect(state.top, "the caret block is not above the view").toBeGreaterThanOrEqual(state.viewTop - 1);
  expect(state.bottom, "the caret block is not below the view").toBeLessThanOrEqual(state.viewBottom + 1);
  const scrolled = state.scrollTop - previous.scrollTop;
  expect(scrolled, "the page never scrolls back up").toBeGreaterThanOrEqual(0);
  expect(scrolled, "the page follows by about one line, no jump").toBeLessThanOrEqual(state.height * 1.5);
}

test.describe("repeated trailing blank lines (#329)", () => {
  test("the caret stays at the end and the view follows it line by line", async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openFreshPage(page, baseURL);
    await typeTextLines(page, TEXT_LINES);
    let previous = await caretState(page);
    expect(previous.index).toBe(TEXT_LINES);
    for (let press = 1; press <= BLANK_LINES; press += 1) {
      await page.keyboard.press("Enter");
      const expectedIndex = TEXT_LINES + press;
      await expect.poll(async () => (await caretState(page)).index).toBe(expectedIndex);
      const state = await caretState(page);
      expectFollowed(state, previous, expectedIndex);
      previous = state;
    }
  });
});

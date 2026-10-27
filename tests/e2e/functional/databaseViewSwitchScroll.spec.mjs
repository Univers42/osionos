/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseViewSwitchScroll.spec.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Switching view tabs in an inline database far down a page threw the reader
// back to the top of the page: each new view's virtualizer reset the page
// scroller to 0 when it attached, so every switch felt like a reload.

import { expect, test } from "@playwright/test";

import { createParagraphs, focusEditorEnd, getEditors, openFreshPage, pressEnter, slashCommandEntry } from "../../browser/core/app.mjs";
import { addView } from "../support/databaseHelpers.mjs";

const ABOVE = 20;
const BELOW = 20;

async function databaseMidPage(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFreshPage(page, "/");
  await createParagraphs(page, Array.from({ length: ABOVE + BELOW }, (_, i) => `Line ${i + 1}`));
  const anchor = getEditors(page).nth(ABOVE - 1);
  await focusEditorEnd(anchor);
  await pressEnter(anchor);
  await page.keyboard.type("/database");
  await slashCommandEntry(page, "Database - Inline").click();
  const block = page.locator(".osionos-database-block--inline").first();
  await expect(block.getByText("Untitled Database").first()).toBeVisible({ timeout: 15_000 });
  return block;
}

/** Scrolls the page so the database header sits near the top; returns the scroll offset. */
async function scrollToDatabase(block) {
  return block.evaluate((el) => {
    let node = el.parentElement;
    while (node && !(node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY))) {
      node = node.parentElement;
    }
    window.__pageScroller = node;
    node.scrollTop += el.getBoundingClientRect().top - 120;
    return node.scrollTop;
  });
}

/**
 * The lowest scroll offset seen while `act` runs and for `ms` after it, so a
 * jump to the top that is later restored still counts.
 * Caveat: a jump that starts more than `ms` after the click is not seen; 1500
 * covers the 420 ms slide plus a lazy view's load in the offline build.
 */
async function lowestScrollDuring(page, act, ms = 1500) {
  const sampling = page.evaluate((window_) => new Promise((resolve) => {
    const scroller = window.__pageScroller;
    let lowest = scroller.scrollTop;
    const end = performance.now() + window_;
    const tick = () => {
      lowest = Math.min(lowest, scroller.scrollTop);
      if (performance.now() < end) requestAnimationFrame(tick);
      else resolve({ lowest, final: scroller.scrollTop });
    };
    requestAnimationFrame(tick);
  }), ms);
  await act();
  return sampling;
}

test("switching view tabs keeps the page where the reader is", async ({ page }) => {
  const block = await databaseMidPage(page);
  for (const view of ["Board", "List", "Gallery"]) await addView(block, page, view);

  const offset = await scrollToDatabase(block);
  expect(offset).toBeGreaterThan(200);

  for (const view of ["Table", "Board", "List", "Gallery", "Table"]) {
    const tab = block.getByRole("button", { name: view, exact: true });
    const seen = await lowestScrollDuring(page, () => tab.click());
    expect(seen, `switching to ${view}`).toEqual({ lowest: offset, final: offset });
  }
});

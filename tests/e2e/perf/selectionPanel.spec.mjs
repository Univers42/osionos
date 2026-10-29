/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   selectionPanel.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Selection panel reveal: selectionchange -> the panel's node is in the DOM.
// It lives here, not in functional/: a shared 2-vCPU CI runner measured 28-29 ms
// for what a desktop paints in ~15 ms, so the 20 ms target is judged on the perf
// gate (test-e2e-perf), not on CI.

import { test } from "@playwright/test";

import { activateFirstEditor, clearAndType, openFreshPage } from "../../browser/core/app.mjs";
import { PERF_USE, assertBudget, summarize } from "./perfHarness.mjs";

test.use(PERF_USE);

const SPEC = "selectionPanel";
const SAMPLES = 10;
const BUDGET = { target: 20, budget: 30 };
const PANEL = '[data-testid="inline-selection-toolbar"]';

/** Selects "alpha" and returns ms from the selectionchange to the panel mount. */
async function measureReveal(page) {
  await page.evaluate((panel) => {
    const editor = document.querySelector('[role="textbox"][aria-multiline="true"]');
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && (node.nodeValue || "").length < 5) node = walker.nextNode();
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 5);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    window.__perf = { started: 0, panelTime: 0 };
    const observer = new MutationObserver(() => {
      if (document.querySelector(panel) && !window.__perf.panelTime) {
        window.__perf.panelTime = performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__perf.started = performance.now();
    document.dispatchEvent(new Event("selectionchange"));
  }, PANEL);
  await page.locator(PANEL).waitFor({ timeout: 5000 });
  return page.evaluate(() => window.__perf.panelTime - window.__perf.started);
}

test("selection panel reveal after selectionchange", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await clearAndType(editor, "alpha beta gamma");

  const samples = [];
  for (let run = 0; run < SAMPLES; run += 1) {
    samples.push(await measureReveal(page));
    await page.keyboard.press("Escape");
    await page.locator(PANEL).waitFor({ state: "detached" });
  }
  assertBudget(SPEC, "reveal", summarize(samples), BUDGET);
});

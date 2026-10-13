/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   enterFocus.spec.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Enter in a block page, then a key pressed at once: the key must land in the NEW block.
// The probe times Enter keydown -> the new block in the DOM -> focus inside it, and counts the
// keys that arrived while focus was still in the old block (each one is a character typed into
// the wrong block; caretAfterEdit and arrowNavSplitPane lost one this way, 2026-10-13).
// Ponytail: Playwright sends each key only after the page acknowledged the previous one, so
// this is a fast typist, not the fastest possible one; a key buffered by the OS faster than that
// is not exercised here (under-reports a race, never invents one).

import { expect, test } from "@playwright/test";

import { createNewWorkspacePage } from "../../browser/core/app.mjs";
import { PERF_USE, summarize, writeReport } from "./perfHarness.mjs";

test.use(PERF_USE);

const SPEC = "enterFocus";
const ENTERS = 30;

async function openEditor(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("osio:perf", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createNewWorkspacePage(page);
  const empty = page.getByRole("button", { name: /Click here to start writing/i });
  if (await empty.count()) await empty.click();
  const editor = page.locator('[role="textbox"][aria-multiline="true"]').first();
  await editor.waitFor();
  await editor.click();
  return editor;
}

function installProbe() {
  const probe = { samples: [], early: 0, current: null };
  globalThis.__enterProbe = probe;
  const blockOf = (node) => (node instanceof Element ? node.closest("[data-block-id]") : null);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      probe.current = { t0: performance.now(), from: blockOf(document.activeElement), dom: null, focus: null };
      probe.samples.push(probe.current);
    } else if (probe.current && probe.current.focus === null) {
      probe.early += 1;
    }
  }, true);
  document.addEventListener("focusin", (event) => {
    const sample = probe.current;
    const block = blockOf(event.target);
    if (sample && sample.focus === null && block && block !== sample.from) sample.focus = performance.now() - sample.t0;
  }, true);
  new MutationObserver((records) => {
    const sample = probe.current;
    if (!sample || sample.dom !== null) return;
    const added = records.some((r) => [...r.addedNodes].some((n) => n instanceof Element && (n.matches("[data-block-id]") || n.querySelector("[data-block-id]"))));
    if (added) sample.dom = performance.now() - sample.t0;
  }).observe(document.body, { childList: true, subtree: true });
}

async function enterThenType(page, caseName) {
  await page.keyboard.type("start", { delay: 0 });
  await page.evaluate(installProbe);
  for (let index = 0; index < ENTERS; index += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.press("k");
  }
  await page.waitForTimeout(1_000);
  const result = await page.evaluate(() => {
    const { samples, early } = globalThis.__enterProbe;
    const texts = [...document.querySelectorAll('[data-block-id] [contenteditable="true"]')].map((el) => el.textContent);
    return { early, dom: samples.map((s) => s.dom ?? Number.NaN), focus: samples.map((s) => s.focus ?? Number.NaN), texts };
  });
  const misplaced = result.texts.slice(1).filter((text) => text !== "k").length + (result.texts[0] === "start" ? 0 : 1);
  writeReport(SPEC, caseName, { early: result.early, misplaced, domMs: summarize(result.dom), focusMs: summarize(result.focus) });
  expect({ early: result.early, misplaced, blocks: result.texts.length }).toEqual({ early: 0, misplaced: 0, blocks: ENTERS + 1 });
}

test("Enter then a key, workbench ON: the key lands in the new block", async ({ page }) => {
  test.setTimeout(120_000);
  await openEditor(page);
  await enterThenType(page, "workbenchOn");
});

// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   typing.spec.mjs                                    :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// Typing in a block page: keydown -> painted frame, plus the page-store actions in us.
// Budgets, measured 2026-10-13 with tracing OFF (Docker, software rendering, shared host), p95
// over n=30, two runs. The floor (an unhandled key to the same 2nd rAF) is 31 ms here, and every
// case sits on it: typing costs no frame over the method's floor, 2 000 pages included. Earlier
// numbers (2 000 pages: p95 140-146 ms) measured Playwright's trace snapshotter (PERF_USE).
// Target 16 ms is below the floor, so it is MISSED by method; budget = worst p95 x 1.2:
//   workbench ON,  default seed : p95 31.5-31.9 ms (floor 30.7-31.0) -> 38
//   workbench ON,  ~2000 pages  : p95 31.8-31.9 ms (floor 31.5)      -> 38
//   workbench ON,  ~10000 pages : p95 31.4 ms (floor 31.2), one run   -> 38
// The page cache write is not in the keystroke: at 10 000 pages savePagesCache costs ~26 ms
// once per typing pause (idle callback; probe 2026-10-13: JSON.stringify 6-7 ms, setItem of
// the 3.7 MB string 15-17 ms), so a key pressed during it waits up to that long.
// A keystroke that costs one more frame lands at ~48 ms and fails all three.

import { expect, test } from "@playwright/test";

import { createNewWorkspacePage } from "../../browser/core/app.mjs";
import { PERF_USE, assertBudget, bootApp, measureFloor, measureToPaint, readStoreMicros, writeReport } from "./perfHarness.mjs";

test.use(PERF_USE);

const SPEC = "typing";
const TARGET_MS = 16;
const BUDGET = { defaultSeed: 38, pages2000: 38, pages10000: 38 };

async function openEditor(page) {
  await bootApp(page);
  await createNewWorkspacePage(page);
  const editor = page.locator('[role="textbox"][aria-multiline="true"]').first();
  const empty = page.getByRole("button", { name: /Click here to start writing/i });
  if (await empty.count()) await empty.click();
  await editor.waitFor();
  await editor.click();
  return editor;
}

async function typeCase(page, editor, caseName, budget) {
  const floor = await measureFloor(page);
  await editor.click();
  await page.evaluate(() => globalThis.__perfReset());
  const stats = await measureToPaint(page, () => page.keyboard.press("a"));
  await page.waitForTimeout(2_000); // the store write is debounced; let it land before reading
  expect(await editor.textContent()).toContain("a".repeat(35));
  const store = {};
  for (const name of ["updateBlock", "updatePageContent", "savePagesCache"]) store[name] = await readStoreMicros(page, name);
  assertBudget(SPEC, caseName, stats, { target: TARGET_MS, budget }, { storeMicros: store, floor });
}

test("block page typing, workbench ON, default seed", async ({ page }) => {
  test.setTimeout(120_000);
  const editor = await openEditor(page);
  await typeCase(page, editor, "defaultSeed", BUDGET.defaultSeed);
});

test("block page typing, workbench ON, ~2000 pages seeded", async ({ page }) => {
  test.setTimeout(120_000);
  const editor = await openEditor(page);
  const seeded = await page.evaluate(() => globalThis.__perfSeedPages(2000));
  writeReport(SPEC, "seed2000", { seeded });
  await typeCase(page, editor, "pages2000", BUDGET.pages2000);
});

test("block page typing, workbench ON, ~10000 pages seeded", async ({ page }) => {
  test.setTimeout(180_000);
  const editor = await openEditor(page);
  const seeded = await page.evaluate(() => globalThis.__perfSeedPages(10_000));
  writeReport(SPEC, "seed10000", { seeded });
  await typeCase(page, editor, "pages10000", BUDGET.pages10000);
});

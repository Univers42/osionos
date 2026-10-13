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
//   workbench OFF, default seed : p95 31.2-31.7 ms (floor 30.8-30.9) -> 38
//   workbench ON,  ~2000 pages  : p95 31.8-31.9 ms (floor 31.5)      -> 38
// A keystroke that costs one more frame lands at ~48 ms and fails all three.

import { expect, test } from "@playwright/test";

import { createNewWorkspacePage } from "../../browser/core/app.mjs";
import { PERF_USE, assertBudget, bootApp, measureFloor, measureToPaint, readStoreMicros, writeReport } from "./perfHarness.mjs";

test.use(PERF_USE);

const SPEC = "typing";
const TARGET_MS = 16;
const BUDGET = { workbenchOn: 38, workbenchOff: 38, pages2000: 38 };

async function openEditor(page, workbench) {
  await bootApp(page, { workbench });
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
  const editor = await openEditor(page, true);
  await typeCase(page, editor, "workbenchOn.defaultSeed", BUDGET.workbenchOn);
});

test("block page typing, workbench ON, ~2000 pages seeded", async ({ page }) => {
  test.setTimeout(120_000);
  const editor = await openEditor(page, true);
  const seeded = await page.evaluate(() => globalThis.__perfSeedPages(2000));
  writeReport(SPEC, "seed2000", { seeded });
  await typeCase(page, editor, "workbenchOn.pages2000", BUDGET.pages2000);
});

test("block page typing, workbench OFF baseline", async ({ page }) => {
  test.setTimeout(120_000);
  const editor = await openEditor(page, false);
  await typeCase(page, editor, "workbenchOff.defaultSeed", BUDGET.workbenchOff);
});

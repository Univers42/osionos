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
// Budgets, measured 2026-10-13 (Docker, software rendering, shared host), p95 over n=30.
// Target 16 ms is MISSED in every case, so budget = worst observed p95 x 1.2 (rule: a missed
// target is reported, never loosened silently). The floor (an unhandled key to the same 2nd rAF)
// is 19-25 ms here, i.e. the method's frame cadence dominates:
//   workbench ON,  default seed : p95 26.4 ms (floor 25.9)  -> 32
//   workbench OFF, default seed : p95 24.7 ms (floor 25.2)  -> 30
//   workbench ON,  ~2000 pages  : p95 140-146 ms (floor 76.8; updatePageContent ~12 ms/call) -> 175

import { expect, test } from "@playwright/test";

import { createNewWorkspacePage } from "../../browser/core/app.mjs";
import { assertBudget, bootApp, measureFloor, measureToPaint, readStoreMicros, writeReport } from "./perfHarness.mjs";

const SPEC = "typing";
const TARGET_MS = 16;
const BUDGET = { workbenchOn: 32, workbenchOff: 30, pages2000: 175 };

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

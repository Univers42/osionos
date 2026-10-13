// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   titleTyping.spec.mjs                               :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// Typing in a page TITLE: keydown -> painted frame. Unlike the body, the title commits to the
// store on every key (PageTitle onChange -> updatePageTitle), and a title is one of the five
// fields the page index is built from. The Files panel is the default, so the explorer is mounted,
// as it is for a user renaming with the tree visible.
// Budgets, measured 2026-10-13 (tracing OFF, n=30; floor = an unhandled key to the same frame):
//   workbench ON,  default seed  : p95 31.1-31.8 ms (floor 30.6-31.4)           -> 38
//   workbench ON,  ~10000 pages  : p95 31.1-31.8 ms (floor 30.8-31.2)           -> 38
//   workbench OFF, ~1000 pages   : p95 33.5 ms, median 29.5 (floor 30.8)        -> 60
//   workbench OFF, ~5000 pages   : p95 76.9 ms, median 54.6 (floor 31.0)        -> 92
// The workbench cases render NO explorer rows offline (explorerRows 0 in the report): the
// workspace:// mount that serves pages without a sandbox is not wired yet, so they measure the
// store, header and tab strip, not the tree.
// The legacy page tree (workbench OFF) was linear in the page count per key: p95 240 / 393 / 685
// / 1834 ms at 500 / 1000 / 2000 / 5000 pages. CPU profiles (keystrokeProfile.spec.mjs, "title
// keystroke") gave three causes, all fixed: every keystroke rebuilt pagesIndex (derivePageState),
// waking every subscriber to it; each row's closed options menu scanned every page per store
// commit; and the recents update re-rendered the whole tree, whose rows were not memoized. What
// is left at 5000 pages is per mounted row: each row's store selectors run on every commit.
// Then (p95 110 -> 81.5 ms at 5000): a title key was two store commits (updatePageTitle, then
// the active-page patch) and each row subscribed to six store actions; now one commit, and rows
// read actions at call time. Then (median 61.3 -> 54.6 ms): the title textarea measured its own
// height in a layout effect (a forced layout per key; CSS field-sizing now) and four root-section
// selectors re-sorted every root on every commit (incrementalGrouping.ts reuses them).
// Still linear: ~10 000 row subscriptions are notified per key.

import { expect, test } from "@playwright/test";

import { createNewWorkspacePage } from "../../browser/core/app.mjs";
import { PERF_USE, assertBudget, bootApp, measureFloor, measureToPaint, readStoreMicros, writeReport } from "./perfHarness.mjs";

test.use(PERF_USE);

const SPEC = "titleTyping";
const TARGET_MS = 16;
const BUDGET = { workbenchOn: 38, pages10000: 38, workbenchOff1000: 60, workbenchOff5000: 92 };

async function openTitle(page, workbench) {
  await bootApp(page, { workbench });
  await createNewWorkspacePage(page);
  const title = page.getByLabel("Page title");
  await title.waitFor();
  return title;
}

async function typeCase(page, title, caseName, budget) {
  const floor = await measureFloor(page);
  await title.click();
  await page.evaluate(() => globalThis.__perfReset());
  const stats = await measureToPaint(page, () => page.keyboard.press("a"));
  await expect(title).toHaveValue(/a{35}$/);
  await page.waitForTimeout(2_000); // let the debounced cache write land before reading it
  const store = {};
  for (const name of ["updatePageTitle", "savePagesCache"]) store[name] = await readStoreMicros(page, name);
  const explorerRows = await page.locator('[role="treeitem"]').count();
  assertBudget(SPEC, caseName, stats, { target: TARGET_MS, budget }, { storeMicros: store, floor, explorerRows });
}

test("title typing, workbench ON, default seed", async ({ page }) => {
  test.setTimeout(120_000);
  const title = await openTitle(page, true);
  await typeCase(page, title, "workbenchOn.defaultSeed", BUDGET.workbenchOn);
});

test("title typing, workbench ON, ~10000 pages seeded", async ({ page }) => {
  test.setTimeout(180_000);
  const title = await openTitle(page, true);
  writeReport(SPEC, "seed10000", { seeded: await page.evaluate(() => globalThis.__perfSeedPages(10_000)) });
  await typeCase(page, title, "workbenchOn.pages10000", BUDGET.pages10000);
});

test("title typing, workbench OFF (legacy page tree), ~1000 pages seeded", async ({ page }) => {
  test.setTimeout(300_000);
  const title = await openTitle(page, false);
  writeReport(SPEC, "seed1000off", { seeded: await page.evaluate(() => globalThis.__perfSeedPages(1000)) });
  await typeCase(page, title, "workbenchOff.pages1000", BUDGET.workbenchOff1000);
});

test("title typing, workbench OFF (legacy page tree), ~5000 pages seeded", async ({ page }) => {
  test.setTimeout(300_000);
  const title = await openTitle(page, false);
  writeReport(SPEC, "seed5000off", { seeded: await page.evaluate(() => globalThis.__perfSeedPages(5000)) });
  await typeCase(page, title, "workbenchOff.pages5000", BUDGET.workbenchOff5000);
});

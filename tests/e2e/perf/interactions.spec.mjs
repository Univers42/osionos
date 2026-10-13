// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   interactions.spec.mjs                              :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// Survey of everyday interactions, input -> painted frame, on the DEFAULT path (workbench ON).
// One CPU profile per case lands in test-results/perf/interactions.<case>.cpuprofile.
//
// Ponytail: dev build + React StrictMode inflate every number against production; the browser
// is Docker software rendering on a shared host, so p95 is an upper bound (a noisy neighbour
// makes a false FAIL, never a false pass). NOT covered: first-ever open of a lazy chunk (warmups
// pay it), the Ctrl+Shift+F search panel, panes/split, media pages, real network. Palette
// "painted" means the search input holds focus, not that results were listed. Every page
// switch is measured A -> B after an untimed reset B -> A, never B -> B.

import { test, expect } from "@playwright/test";

import { activateFirstEditor, createNewWorkspacePage, explorerRow, getEditors, slashMenu, waitForRenderStability } from "../../browser/core/app.mjs";
import { runInteraction } from "./interactionRun.mjs";
import { PERF_USE, bootApp, measureFloor, writeReport } from "./perfHarness.mjs";

test.use(PERF_USE);

const SPEC = "interactions";
const OPEN_TARGET = 50;
const EDIT_TARGET = 16;
const HEAVY_TARGET = 100;
// Measured 2026-10-13 (Docker, software rendering, p95 over n=20, one run, floor median 30-32 ms):
// every case within ~1 frame of the floor is floor-bound; targets 16/50/100 ms. PASS keeps
// budget = target, FINDING budget = p95 x 1.2.
//   page switch, default seed : p95 68.6 ms (median 29.9) vs 50 -> FINDING, 82
//   page switch, ~1000 pages  : p95 70.6 ms (median 35.3, +4.6 over floor) vs 50 -> FINDING, 85
//     (was p95 402.2, median 306.4: every tree row took the active id as a prop and re-rendered
//     on each navigation; rows now subscribe by key, src/store/activePageFlag.ts)
//   Enter at block end        : p95 30.8 ms vs 16 (floor-bound) -> FINDING, 37
//   "/" slash menu            : p95 31.4 ms vs 16 (floor-bound) -> FINDING, 38
//   Ctrl+K palette focus      : p95 23.5 ms vs 50 -> PASS, 50
//   open settings             : p95 51.1 ms (median 48.0, +16.8 over floor) vs 50 -> FINDING, 61
//   tab switch                : p95 68.5 ms (median 29.4) vs 50 -> FINDING, 82
//   300-block page open       : p95 67.8 ms vs 100 -> PASS, 100 (26 blocks mounted: virtualised)
//   database view first cell  : p95 88.0 ms (median 37.6) vs 100 -> PASS, 100
const BUDGET = {
  pageSwitch: 82, pageSwitch1000: 85, enter: 37, slash: 38, search: 50,
  settings: 61, tabSwitch: 82, longPage: 100, database: 100,
};

const START = { title: "Getting Started", text: "Welcome to the Playground" };
const ROADMAP = { title: "Project Roadmap", text: "Roadmap — Q2 2026" };
const BLOCK = "[data-block-id]";
const SLASH_MENU = '[data-testid="slash-command-menu"]';

const blockWith = (page, text) => page.locator(BLOCK, { hasText: text }).first();

async function boot(page) {
  await bootApp(page);
  await explorerRow(page, START.title).waitFor({ state: "visible", timeout: 30_000 });
  return measureFloor(page);
}

async function openAndWait(page, target) {
  await explorerRow(page, target.title).click();
  await expect(blockWith(page, target.text)).toBeVisible();
}

async function pageSwitchCase(page, name, seedPages = 0) {
  const floor = await boot(page);
  if (seedPages > 0) {
    const result = await page.evaluate((n) => globalThis.__perfSeedFolder(n), seedPages);
    writeReport(SPEC, `${name}.seed`, { seeded: result.childCount });
  }
  await runInteraction(page, {
    spec: SPEC, name, floor, target: OPEN_TARGET, budget: BUDGET[name], startEvent: "click",
    before: () => openAndWait(page, START),
    action: () => explorerRow(page, ROADMAP.title).click(),
    until: { selector: BLOCK, text: ROADMAP.text },
  });
}

test("page switch, default seed", async ({ page }) => {
  test.setTimeout(240_000);
  await pageSwitchCase(page, "pageSwitch");
});

test("page switch, ~1000 pages seeded", async ({ page }) => {
  test.setTimeout(360_000);
  await pageSwitchCase(page, "pageSwitch1000", 1000);
  // the folder stays collapsed, so the target rows stay mounted while the store holds 1000 more pages
});

// A fresh page holding "hello" with the caret at its end.
async function openTextPage(page) {
  await createNewWorkspacePage(page);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("hello", { delay: 20 });
  await expect(editor).toHaveAttribute("data-empty", "false"); // typing before hydration leaves the model empty
  return editor;
}

const emptyBlocks = (page) => page.locator('[role="textbox"][data-empty="true"]');

test("Enter at end of a text block", async ({ page }) => {
  test.setTimeout(240_000);
  const floor = await boot(page);
  const first = await openTextPage(page);
  await runInteraction(page, {
    spec: SPEC, name: "enter", floor, target: EDIT_TARGET, budget: BUDGET.enter, startEvent: "keydown",
    before: async () => {
      if (await emptyBlocks(page).count()) await page.keyboard.press("Backspace"); // merges back, caret at end of "hello"
      await expect(emptyBlocks(page)).toHaveCount(0);
      await first.press("End"); // the merge can drop focus; Enter on <body> would time out
    },
    action: () => page.keyboard.press("Enter"),
    until: { selector: '[role="textbox"][data-empty="true"]' },
  });
  await expect(first).toHaveText("hello");
});

test("slash in an empty block", async ({ page }) => {
  test.setTimeout(240_000);
  const floor = await boot(page);
  await openTextPage(page);
  await page.keyboard.press("Enter");
  const last = getEditors(page).last();
  await expect(last).toBeFocused();
  await runInteraction(page, {
    spec: SPEC, name: "slash", floor, target: EDIT_TARGET, budget: BUDGET.slash, startEvent: "keydown",
    before: async () => {
      if (await slashMenu(page).count()) await page.keyboard.press("Escape");
      await expect(slashMenu(page)).toHaveCount(0);
      await last.press("End"); // Escape can drop focus; "/" on <body> opens nothing
      if ((await last.textContent()).includes("/")) await page.keyboard.press("Backspace");
      await expect(last).toHaveAttribute("data-empty", "true"); // the model, not just the DOM, is empty
      await waitForRenderStability(page);
    },
    action: () => page.keyboard.press("/"),
    until: { selector: SLASH_MENU },
  });
});

test("open quick-find palette (Ctrl+K)", async ({ page }) => {
  test.setTimeout(240_000);
  const floor = await boot(page);
  const input = page.getByRole("combobox", { name: "Search pages or run a command" });
  await runInteraction(page, {
    spec: SPEC, name: "search", floor, target: OPEN_TARGET, budget: BUDGET.search, startEvent: "keydown",
    before: async () => {
      if (await input.evaluate((node) => node === document.activeElement)) await page.keyboard.press("Escape");
      await expect(input).not.toBeFocused();
    },
    action: () => page.keyboard.press("Control+k"),
    until: { selector: 'input[role="combobox"]:focus' },
  });
});

test("open settings", async ({ page }) => {
  test.setTimeout(240_000);
  const floor = await boot(page);
  const close = page.getByRole("button", { name: "Close settings" });
  await runInteraction(page, {
    spec: SPEC, name: "settings", floor, target: OPEN_TARGET, budget: BUDGET.settings, startEvent: "click",
    before: async () => {
      if (await close.count()) await close.click();
      await expect(close).toHaveCount(0);
    },
    action: () => page.getByRole("button", { name: "Settings", exact: true }).first().click(),
    until: { selector: 'button[aria-label="Close settings"]' },
  });
});

test("switch workspace tab", async ({ page }) => {
  test.setTimeout(240_000);
  const floor = await boot(page);
  await openAndWait(page, START);
  await openAndWait(page, ROADMAP);
  const startTab = page.locator(`[data-tab-id][title="${START.title}"]`);
  const roadmapTab = page.locator(`[data-tab-id][title="${ROADMAP.title}"]`);
  await expect(startTab).toHaveCount(1);
  await runInteraction(page, {
    spec: SPEC, name: "tabSwitch", floor, target: OPEN_TARGET, budget: BUDGET.tabSwitch, startEvent: "click",
    before: async () => {
      await startTab.click();
      await expect(blockWith(page, START.text)).toBeVisible();
    },
    action: () => roadmapTab.click(),
    until: { selector: BLOCK, text: ROADMAP.text },
  });
});

test("open a 300-block page", async ({ page }) => {
  test.setTimeout(240_000);
  const floor = await boot(page);
  const seeded = await page.evaluate(() => globalThis.__perfSeed(300)); // opens it
  writeReport(SPEC, "longPage.seed", { seeded });
  await expect(explorerRow(page, "Perf 300 blocks")).toBeVisible();
  await runInteraction(page, {
    spec: SPEC, name: "longPage", floor, target: HEAVY_TARGET, budget: BUDGET.longPage, startEvent: "click",
    before: () => openAndWait(page, START),
    action: () => explorerRow(page, "Perf 300 blocks").click(),
    until: { selector: '[data-block-id="perf-block-300-20"]' },
  });
});

test("open a database view", async ({ page }) => {
  test.setTimeout(240_000);
  const floor = await boot(page);
  const cells = page.locator('[role="gridcell"]');
  await runInteraction(page, {
    spec: SPEC, name: "database", floor, target: HEAVY_TARGET, budget: BUDGET.database, startEvent: "click",
    before: async () => {
      await openAndWait(page, START);
      await expect(cells).toHaveCount(0);
    },
    action: () => explorerRow(page, "Tasks database").click(),
    until: { selector: '[role="gridcell"]' },
  });
});

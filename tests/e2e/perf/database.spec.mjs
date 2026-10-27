// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   database.spec.mjs                                  :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// Everyday database interactions, input -> painted frame, on the seeded Tasks
// database grown to 1,730 rows: the largest database on the funnel's largest
// account (2026-10-26). One CPU profile per case lands in
// test-results/perf/database.<case>.cpuprofile.
//
// Caveat: dev build + React StrictMode inflate every number against
// production, and Docker software rendering on a shared host makes p95 an upper
// bound (a noisy neighbour makes a false FAIL, never a false pass). Rows are
// seeded through browser storage, so the server sync path is not measured.

import { test, expect } from "@playwright/test";

import { explorerRow } from "../../browser/core/app.mjs";
import { runInteraction } from "./interactionRun.mjs";
import { PERF_USE, bootApp, measureFloor } from "./perfHarness.mjs";

test.use(PERF_USE);

const SPEC = "database";
const ROWS = 1_730;
const EDIT_TARGET = 16;
const OPEN_TARGET = 50;
// A row opens a whole page editor beside the table: one Notion-like peek.
const MOUNT_TARGET = 100;
// Measured 2026-10-27, p95 over n=20 (floor median 29-31 ms). Dev build, the
// default run; budget = target on PASS, worst p95 x 1.2 on FINDING:
//   search keystroke  29 ms vs 50 -> PASS, 50
//   filter picker     38 ms vs 50 -> PASS, 50
//   sort direction    95 / 149 ms vs 50 -> FINDING, 179
//   scroll, all rows  97 / 113 ms vs 16 -> FINDING, 136
//   cell commit       41 ms vs 16 -> FINDING, 49
//   open a row        92 / 157 / 110 ms vs 100 -> FINDING, 132
//   add a row        118 ms vs 100 -> FINDING, 142
// Production build (PLAYWRIGHT_BUILD=production), the same cases: p95 27,
// 28, 38, 32, 26, 35, 43 ms; every median sits at the floor. The dev gap is
// React's development build and StrictMode, not the database.
const BUDGET = {
  searchKeystroke: 50, filterPicker: 50, sortDirection: 179, scrollPage: 136,
  cellCommit: 49, rowOpen: 132, rowAdd: 142,
};

async function bootWithRows(page) {
  await page.addInitScript((rows) => {
    if (localStorage.getItem("osionos.knownDatabaseState.v1")) return;
    const pages = {};
    const statuses = ["opt-todo", "opt-in-progress", "opt-review", "opt-done", "opt-blocked"];
    for (let i = 0; i < rows; i += 1) {
      const id = `perf-task-${i}`;
      pages[id] = {
        id, databaseId: "db-tasks", content: [], createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
        properties: {
          "prop-title": `Task ${i} ${i % 7 === 0 ? "alpha" : "beta"}`, "prop-status": statuses[i % 5],
          "prop-points": i % 13, "prop-done": i % 3 === 0, "prop-due": `2026-${String(1 + (i % 12)).padStart(2, "0")}-15`,
        },
      };
    }
    localStorage.setItem("osionos.knownDatabaseState.v1", JSON.stringify({ pages }));
  }, ROWS);
  await bootApp(page);
  await explorerRow(page, "Tasks database").waitFor({ state: "visible", timeout: 30_000 });
  const floor = await measureFloor(page);
  await explorerRow(page, "Tasks database").click();
  await expect(page.locator('[role="gridcell"]').first()).toBeVisible({ timeout: 30_000 });
  // The Tasks page holds the database as a block, so the block's own toolbar
  // carries the tools (the engine's .odb-topbar is not rendered there).
  return { floor, bar: page.locator(".osionos-database-block", { has: page.getByRole("grid") }).first() };
}

const caseFor = (name, target) => ({ spec: SPEC, name, target, budget: BUDGET[name] });

// The record surface (DatabaseBlock's DatabaseObjectPage) is painted once its
// page title is: an empty page body is not editable until it is clicked.
const RECORD_READY = { selector: 'aside[data-open-in] textarea[aria-label="Page title"]' };

async function closeRecord(page) {
  const record = page.locator("aside[data-open-in]");
  if (await record.count()) {
    await record.getByRole("button", { name: "Close", exact: true }).click();
    await expect(record).toHaveCount(0);
  }
}

test("search keystroke", async ({ page }) => {
  test.setTimeout(300_000);
  const { floor, bar } = await bootWithRows(page);
  await bar.getByRole("button", { name: "Search", exact: true }).click();
  const input = page.getByRole("searchbox", { name: "Search database" });
  let n = 0;
  await runInteraction(page, {
    ...caseFor("searchKeystroke", OPEN_TARGET), floor,
    before: async () => { await input.fill(""); await input.focus(); },
    action: () => input.press(String(n++ % 10)),
    until: { selector: '[role="status"]', text: "match" },
  });
});

test("open the filter picker", async ({ page }) => {
  test.setTimeout(300_000);
  const { floor, bar } = await bootWithRows(page);
  const button = bar.getByRole("button", { name: "Filter", exact: true });
  await runInteraction(page, {
    ...caseFor("filterPicker", OPEN_TARGET), floor, startEvent: "click",
    before: async () => { await page.keyboard.press("Escape"); },
    action: () => button.click(),
    until: { selector: 'dialog[aria-label="Add filter"]' },
  });
});

test("toggle a sort", async ({ page }) => {
  test.setTimeout(300_000);
  const { floor, bar } = await bootWithRows(page);
  await bar.getByRole("button", { name: "Sort", exact: true }).click();
  const sort = page.getByRole("dialog", { name: "Sort" });
  await sort.getByRole("button", { name: "Story Points", exact: true }).click();
  const direction = sort.getByRole("button", { name: /^Direction:/ });
  let next = "Descending";
  await runInteraction(page, {
    ...caseFor("sortDirection", OPEN_TARGET), floor, startEvent: "click",
    before: async () => { await direction.click(); },
    action: async () => { await page.getByRole("button", { name: next, exact: true }).click(); next = next === "Descending" ? "Ascending" : "Descending"; },
  });
});

test("edit a cell", async ({ page }) => {
  test.setTimeout(300_000);
  const { floor } = await bootWithRows(page);
  const cell = page.locator("tbody tr").first().locator("td").first();
  let n = 0;
  await runInteraction(page, {
    ...caseFor("cellCommit", EDIT_TARGET), floor,
    before: async () => {
      // A committed cell stays selected (Escape keeps it so), and a click on
      // a selected cell is not a plain select: selecting the next row's cell
      // first makes every round start the way the first did.
      await page.locator("tbody tr").nth(1).locator("td").first().click();
      await cell.click();
      await page.keyboard.press("Enter");
      await cell.locator("input, textarea").first().fill(`Edited ${n++}`);
    },
    action: () => page.keyboard.press("Enter"),
  });
});

test("scroll the table", async ({ page }) => {
  test.setTimeout(300_000);
  const { floor } = await bootWithRows(page);
  await page.getByRole("button", { name: "Show all", exact: true }).click();
  const scroller = page.locator("table").first().locator("xpath=ancestor::div[contains(@class,'overflow-auto')][1]");
  let down = true;
  await runInteraction(page, {
    ...caseFor("scrollPage", EDIT_TARGET), floor, startEvent: "wheel",
    action: async () => { await scroller.hover(); await page.mouse.wheel(0, down ? 800 : -800); down = !down; },
  });
});

test("open a row", async ({ page }) => {
  test.setTimeout(300_000);
  const { floor, bar } = await bootWithRows(page);
  const title = bar.getByRole("gridcell").first();
  await runInteraction(page, {
    ...caseFor("rowOpen", MOUNT_TARGET), floor, startEvent: "click",
    before: async () => { await closeRecord(page); await title.hover(); },
    action: () => title.getByText("OPEN").click(),
    until: RECORD_READY,
  });
});

test("add a row", async ({ page }) => {
  test.setTimeout(300_000);
  const { floor, bar } = await bootWithRows(page);
  // The toolbar's New, not the table's own "+ New" row.
  const add = bar.locator(".odb-topbar-new").getByRole("button", { name: "New", exact: true });
  await runInteraction(page, {
    ...caseFor("rowAdd", MOUNT_TARGET), floor, startEvent: "click",
    before: () => closeRecord(page),
    action: () => add.click(),
    until: RECORD_READY,
  });
});

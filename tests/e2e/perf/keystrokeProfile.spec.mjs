/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   keystrokeProfile.spec.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Where does a keystroke's CPU time go? This spec profiles real typing (keydown -> painted
// frame) in the block editor with the workbench ON, at the default seed and at ~2 000 pages,
// and prints the per-function self/total ms tables. It is an instrument, not a gate: the only
// assertions are sanity (text landed, profile non-empty) - no budget is enforced here.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { createNewWorkspacePage } from "../../browser/core/app.mjs";
import { PERF_USE, REPORT_DIR, bootApp, measureToPaint, writeReport } from "./perfHarness.mjs";
import { aggregateProfile, formatTop, profileDuring } from "./perfProfile.mjs";

test.use(PERF_USE);

const SPEC = "keystroke-profile";
const WARMUP_RUNS = 5;
const PROFILE_RUNS = 40;

// Copied from typing.spec.mjs (specs stay standalone): open a block page and focus its editor.
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

async function profileKeystrokeCase(page, editor, { seedPages = 0, caseName, rawName }) {
  if (seedPages > 0) await page.evaluate((count) => globalThis.__perfSeedPages(count), seedPages);
  // Warm-up: five presses, each awaited to paint, so the profiled runs measure a hot editor.
  await measureToPaint(page, () => page.keyboard.press("a"), { runs: WARMUP_RUNS, warmups: 0 });
  let toPaint = { n: 0, median: 0, p95: 0, max: 0 };
  const profile = await profileDuring(page, async () => {
    toPaint = await measureToPaint(page, () => page.keyboard.press("a"), { runs: PROFILE_RUNS, warmups: 0 });
  });
  const { totalMs, self, total } = aggregateProfile(profile);
  console.log(`\n=== ${SPEC} / ${caseName} — self ms (top 30) ===`);
  console.log(formatTop(self, 30));
  console.log(`\n=== ${SPEC} / ${caseName} — total ms, inclusive (top 40) ===`);
  console.log(formatTop(total, 40));
  writeReport(SPEC, caseName, { toPaint, totalMs, selfTop: self.slice(0, 60), totalTop: total.slice(0, 80) });
  writeFileSync(path.join(REPORT_DIR, rawName), `${JSON.stringify(profile)}\n`);
  const typed = "a".repeat(WARMUP_RUNS + PROFILE_RUNS);
  if (await editor.evaluate((node) => node instanceof HTMLInputElement)) await expect(editor).toHaveValue(new RegExp(`${typed}$`));
  else expect(await editor.textContent()).toContain(typed);
  expect(totalMs).toBeGreaterThan(0);
  expect(self.length).toBeGreaterThan(0);
  return toPaint;
}

test("aggregateProfile attributes self and total ms, recursion once", () => {
  // root(1) -> a(2) -> {b(3), a(4) recursive}; root(1) -> idle(5).
  // samples [b, a, b, idle] with deltas [1, 2, 4, 3] ms: the recursive a's sample walks
  // a -> a -> root, and the distinct-key rule must count a ONCE (total a = 7, not 9).
  const origin = "http://127.0.0.1:3004";
  const aKey = "a /src/a.ts:10";
  const profile = {
    nodes: [
      { id: 1, callFrame: { functionName: "(root)", url: `${origin}/src/root.ts`, lineNumber: 0, columnNumber: 0 }, children: [2, 5] },
      { id: 2, callFrame: { functionName: "a", url: `${origin}/src/a.ts`, lineNumber: 9, columnNumber: 0 }, children: [3, 4] },
      { id: 3, callFrame: { functionName: "b", url: `${origin}/src/b.ts`, lineNumber: 19, columnNumber: 0 } },
      { id: 4, callFrame: { functionName: "a", url: `${origin}/src/a.ts`, lineNumber: 9, columnNumber: 0 } },
      { id: 5, callFrame: { functionName: "(idle)", url: "", lineNumber: -1, columnNumber: -1 } },
    ],
    samples: [3, 4, 3, 5],
    timeDeltas: [1000, 2000, 4000, 3000],
  };
  const { totalMs, self, total } = aggregateProfile(profile);
  expect(totalMs).toBe(10);
  expect(self.map((row) => [row.key, row.ms])).toEqual([
    ["b /src/b.ts:20", 5],
    ["(idle)", 3],
    [aKey, 2],
  ]);
  expect(total.map((row) => [row.key, row.ms])).toEqual([
    ["(root) /src/root.ts:1", 10],
    [aKey, 7],
    ["b /src/b.ts:20", 5],
    ["(idle)", 3],
  ]);
  expect(self[0].pct).toBeCloseTo((5 / 7) * 100, 5); // pct base excludes (idle): 10 - 3 = 7 ms
  expect(total[0].pct).toBeCloseTo((10 / 7) * 100, 5); // root exceeds 100% for the same reason
  // vite deps urls shorten to the package file name; an empty name becomes (anonymous).
  const deps = aggregateProfile({
    nodes: [
      { id: 1, callFrame: { functionName: "render", url: `${origin}/node_modules/.vite/deps/@osionos_ui.js?v=9`, lineNumber: 3, columnNumber: 0 } },
      { id: 2, callFrame: { functionName: "", url: `${origin}/src/anon.ts`, lineNumber: 0, columnNumber: 0 } },
    ],
    samples: [1, 2],
    timeDeltas: [2000, 1000],
  });
  expect(deps.total.map((row) => row.key)).toEqual(["render @osionos_ui.js:4", "(anonymous) /src/anon.ts:1"]);
});

test("keystroke CPU profile, workbench ON, ~2000 pages", async ({ page }) => {
  test.setTimeout(180_000);
  const editor = await openEditor(page, true);
  await profileKeystrokeCase(page, editor, {
    seedPages: 2000,
    caseName: "workbenchOn.pages2000",
    rawName: "keystroke-profile.pages2000.cpuprofile",
  });
});

test("keystroke CPU profile, workbench ON, default seed", async ({ page }) => {
  test.setTimeout(180_000);
  const editor = await openEditor(page, true);
  await profileKeystrokeCase(page, editor, {
    seedPages: 0,
    caseName: "workbenchOn.defaultSeed",
    rawName: "keystroke-profile.default.cpuprofile",
  });
});

// The legacy page tree (workbench OFF) re-renders per sidebar row on a title keystroke
// (titleTyping.spec.mjs): this case says which functions that time goes to.
test("title keystroke CPU profile, workbench OFF, ~1000 pages", async ({ page }) => {
  test.setTimeout(300_000);
  await bootApp(page, { workbench: false });
  await createNewWorkspacePage(page);
  const title = page.getByLabel("Page title");
  await title.waitFor();
  await title.click();
  await profileKeystrokeCase(page, title, {
    seedPages: 1000,
    caseName: "titleWorkbenchOff.pages1000",
    rawName: "keystroke-profile.title-off-1000.cpuprofile",
  });
});

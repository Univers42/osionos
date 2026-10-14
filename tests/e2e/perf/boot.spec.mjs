// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   boot.spec.mjs                                      :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// Boot of the app shell, the wait every session starts with: navigation start -> the sidebar's
// "New page" button is visible (the first moment a person can act), with first contentful
// paint, the JavaScript fetched before it and the main-thread long-task time spent on the way.
// Cold = a fresh browser context (empty HTTP cache); warm = a reload in the same context.
// An instrument: it reports, it does not judge (no budget until a baseline exists).
//
// Ponytail: "ready" is polled once per animation frame, so it lands up to one frame (~16 ms)
// late; long tasks are only those the browser reports (>= 50 ms each), so many 40 ms tasks
// read as zero. Offline test mode (no API): network latency of a real backend is NOT included.

import { test } from "@playwright/test";

import { PERF_USE, summarize, writeReport } from "./perfHarness.mjs";

test.use(PERF_USE);

const RUNS = 5;

function installProbe() {
  globalThis.__boot = { ready: null, fcp: null, longTaskMs: 0, longTasks: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (entry.name === "first-contentful-paint") globalThis.__boot.fcp = entry.startTime;
    }).observe({ type: "paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (globalThis.__boot.ready !== null) continue;
        globalThis.__boot.longTaskMs += entry.duration;
        globalThis.__boot.longTasks += 1;
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {
    /* an observer type this browser lacks: long tasks read 0 (paint is in every Chromium) */
  }
  // The same two entry points createNewWorkspacePage (tests/browser/core/app.mjs) acts on.
  const isReady = () => document.querySelector('button[title="Add to Private"], button[title="Add file"]') !== null
    || [...document.querySelectorAll("button")]
      .some((button) => /New page/i.test(button.getAttribute("aria-label") ?? button.textContent ?? "") && button.offsetParent !== null);
  const poll = () => {
    if (isReady()) globalThis.__boot.ready = performance.now();
    else requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}

async function bootOnce(page, navigate) {
  await navigate();
  // FCP can land a frame after "ready" (the poll runs before that frame paints).
  await page.waitForFunction(() => globalThis.__boot?.ready !== null && globalThis.__boot.fcp !== null, null, { timeout: 60_000 });
  return page.evaluate(() => {
    const scripts = performance.getEntriesByType("resource").filter((entry) => entry.initiatorType === "script" || /\.m?js(\?|$)/.test(entry.name));
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      readyMs: globalThis.__boot.ready,
      fcpMs: globalThis.__boot.fcp,
      domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : Number.NaN,
      longTaskMs: globalThis.__boot.longTaskMs,
      longTasks: globalThis.__boot.longTasks,
      scriptCount: scripts.length,
      scriptKiB: scripts.reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0) / 1024,
    };
  });
}

function report(caseName, runs) {
  const pick = (key) => summarize(runs.map((run) => run[key]));
  const data = { ready: pick("readyMs"), fcp: pick("fcpMs"), domContentLoaded: pick("domContentLoadedMs"), longTaskMs: pick("longTaskMs"), scripts: runs[0].scriptCount, scriptKiB: Math.round(runs[0].scriptKiB) };
  writeReport("boot", caseName, { ...data.ready, ...data });
  console.log(`boot ${caseName}: ready median ${data.ready.median.toFixed(0)} ms p95 ${data.ready.p95.toFixed(0)} | fcp ${data.fcp.median.toFixed(0)} | long tasks ${data.longTaskMs.median.toFixed(0)} ms | ${data.scripts} scripts, ${data.scriptKiB} KiB fetched (decoded size; 0 when served from cache)`);
}

test("cold and warm boot to an actionable sidebar", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const cold = [];
  const warm = [];
  for (let run = 0; run < RUNS; run += 1) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 960 } });
    await context.addInitScript(installProbe);
    const page = await context.newPage();
    cold.push(await bootOnce(page, () => page.goto("/", { waitUntil: "commit" })));
    warm.push(await bootOnce(page, () => page.reload({ waitUntil: "commit" })));
    await context.close();
  }
  report("cold", cold);
  report("warm", warm);
});

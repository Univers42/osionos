// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   perfHarness.mjs                                    :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //


// Browser layer of the perf harness: input -> next painted frame, in the real app.
//
// Ponytail: "painted" is approximated as the SECOND requestAnimationFrame after the input
// event (the first rAF runs before the frame that shows the result, the second after it was
// produced) - real presentation time (compositor, GPU, display) is not observable from JS, so
// this under-reports by up to a vsync. The browser runs in Docker with software rendering on a
// shared machine: numbers are an upper bound on a quiet desktop, and a busy neighbour or a GC
// pause inflates p95 (false failure, never a false pass). performance.now() is quantised to
// 100 us outside cross-origin isolation, so store actions timed in "us" have 100 us resolution.
// The timer starts at the page's own capture-phase listener, so CDP delivery latency of the
// synthetic input is excluded. Escape hatch for a noisy host: re-run, or raise runs.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";

/** Every perf spec runs `test.use(PERF_USE)`. Playwright tracing (the config's
 *  retain-on-failure records every test) snapshots the whole DOM on the main thread around
 *  each action: 37 % of the CPU of the 2 000-page keystroke profile (keystrokeProfile.spec,
 *  2026-10-13), so a traced run measures the tracer, not the app. */
export const PERF_USE = { trace: "off" };

export const WARMUPS = 5;
export const RUNS = 30;
export const REPORT_DIR = path.join("test-results", "perf");

/** Nearest-rank percentile (same definition as src/shared/lib/perf/loadTest.ts). */
export function percentile(values, p) {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function summarize(values) {
  return { n: values.length, median: percentile(values, 50), p95: percentile(values, 95), max: Math.max(...values) };
}

/** Opens the app with the workbench flag set as asked; the perf globals come with the dev server. */
export async function bootApp(page, { workbench, ide = false }) {
  await page.addInitScript(({ on, withIde }) => {
    try {
      if (on) localStorage.setItem("osio.workbench", "1");
      else localStorage.removeItem("osio.workbench");
      if (withIde) localStorage.setItem("osio.ide", "1");
    } catch {
      /* ignore */
    }
  }, { on: workbench, withIde: ide });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof globalThis.__perfSeedPages === "function", null, { timeout: 60_000 });
}

// In page: arm() waits for the first `startEvent` (capture phase, so before any app handler),
// then resolves with the elapsed ms at the 2nd rAF - or, with `until`, at the first later rAF
// where {selector, text?} matches.
function armProbe({ startEvent, until }) {
  const probe = {};
  probe.done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${startEvent} within 10 s`)), 10_000);
    globalThis.addEventListener(startEvent, () => {
      const startedAt = performance.now();
      clearTimeout(timer);
      let frames = 0;
      const tick = () => {
        frames += 1;
        const ready = frames >= 2 && (!until || [...document.querySelectorAll(until.selector)].some((el) => !until.text || el.textContent.includes(until.text)));
        if (ready) resolve(performance.now() - startedAt);
        else if (frames > 600) reject(new Error(`${JSON.stringify(until)} not painted within 600 frames`));
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { capture: true, once: true });
  });
  globalThis.__perfProbe = probe;
}

/**
 * Times `action` (which must dispatch the user input) to the painted frame.
 * `before` runs untimed ahead of each run (reset to a known state); `until` is {selector, text?} that
 * must match in the painted frame. Returns {n, median, p95, max} in ms over `runs` samples
 * taken after `warmups` discarded ones.
 */
export async function measureToPaint(page, action, options = {}) {
  const { runs = RUNS, warmups = WARMUPS, startEvent = "keydown", until = null, before = null } = options;
  const samples = [];
  for (let index = 0; index < warmups + runs; index += 1) {
    if (before) await before();
    await page.evaluate(armProbe, { startEvent, until });
    await action();
    const elapsed = await page.evaluate(() => globalThis.__perfProbe.done);
    if (index >= warmups) samples.push(elapsed);
  }
  return summarize(samples);
}

/**
 * The method's own floor: an input nothing handles (ScrollLock on <body>) measured to the same 2nd rAF.
 * An event lands at a random phase of the frame, so even a free interaction costs 0-2 frame
 * intervals; reported next to every case so a number is read as "floor + app", not "app".
 */
export async function measureFloor(page, runs = RUNS) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  return measureToPaint(page, () => page.keyboard.press("ScrollLock"), { runs });
}

/** Reads a `timed()` store action's samples as microseconds. */
export async function readStoreMicros(page, name) {
  const ms = await page.evaluate((n) => globalThis.__perfDurations(n), name);
  return { calls: ms.length, ...(ms.length ? summarize(ms.map((value) => value * 1000)) : {}) };
}

/** Merges one case into test-results/perf/<spec>.json (specs write several cases). */
export function writeReport(spec, caseName, data) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `${spec}.json`);
  let report = {};
  try {
    report = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    /* first case of the run */
  }
  report[caseName] = { measuredAt: new Date().toISOString(), ...data };
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
}

const fmt = (stats) => `median ${stats.median.toFixed(1)} ms, p95 ${stats.p95.toFixed(1)} ms, max ${stats.max.toFixed(1)} ms (n=${stats.n})`;

/** Writes the report and fails with the numbers when p95 exceeds the budget. */
export function assertBudget(spec, caseName, stats, { target, budget }, extra = {}) {
  const verdict = stats.p95 <= target ? "PASS" : "FINDING";
  const overFloorMedian = extra.floor ? stats.median - extra.floor.median : undefined;
  writeReport(spec, caseName, { target, budget, verdict, ...stats, overFloorMedian, ...extra });
  expect(
    stats.p95,
    `${spec} / ${caseName}: ${fmt(stats)} vs budget ${budget} ms (target ${target} ms)`,
  ).toBeLessThanOrEqual(budget);
}

// Typing in a long page (50 blocks: all rendered; 600: windowed): main-thread work per keystroke.
// Probe: CPU profile of 40 keys plus Event Timing (input delay + handlers) per key.

import { expect, test } from "@playwright/test";

import { PERF_USE, bootApp, writeReport } from "./perfHarness.mjs";
import { aggregateProfile, formatTop, profileDuring } from "./perfProfile.mjs";

test.use(PERF_USE);

const SPEC = "long-page-typing";
const KEYS = 40;

for (const blockCount of [50, 600]) {
  test(`typing long page, ${blockCount} blocks`, async ({ page }) => {
    test.setTimeout(240_000);
    await bootApp(page);
    const seed = await page.evaluate((count) => globalThis.__perfSeed(count), blockCount);
    const target = `${seed.typedBlockId.replace(/-0$/, "")}-7`;
    const editor = page.locator(`[data-block-id="${target}"] [contenteditable="true"]`);
    await editor.scrollIntoViewIfNeeded();
    await editor.click();
    await page.keyboard.press("End");
    await page.evaluate(() => {
      globalThis.__keyTimings = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === "keydown" || entry.name === "keypress" || entry.name === "input" || entry.name === "keyup") {
            globalThis.__keyTimings.push({ name: entry.name, busy: entry.processingEnd - entry.startTime, duration: entry.duration });
          }
        }
      }).observe({ type: "event", durationThreshold: 0, buffered: false });
    });
    for (let i = 0; i < 5; i += 1) await page.keyboard.press("a");
    await page.waitForTimeout(500);
    await page.evaluate(() => { globalThis.__keyTimings.length = 0; });
    const profile = await profileDuring(page, async () => {
      for (let i = 0; i < KEYS; i += 1) {
        await page.keyboard.press("b");
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
    });
    await page.waitForTimeout(500);
    const timings = await page.evaluate(() => globalThis.__keyTimings);
    const { totalMs, self, total } = aggregateProfile(profile);
    const idle = self.find((row) => row.key === "(idle)")?.ms ?? 0;
    const program = self.find((row) => row.key === "(program)")?.ms ?? 0;
    const js = totalMs - idle - program;
    const byName = {};
    for (const t of timings) (byName[t.name] ??= []).push(t.busy);
    const summary = Object.fromEntries(Object.entries(byName).map(([name, list]) => {
      const sorted = [...list].sort((a, b) => a - b);
      return [name, { n: list.length, p50: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1) }];
    }));
    console.log(`\n=== ${SPEC} / ${blockCount} — JS ms per key: ${(js / KEYS).toFixed(2)} (program ${(program / KEYS).toFixed(2)})`);
    console.log(JSON.stringify(summary));
    console.log(formatTop(self, 25));
    console.log(formatTop(total, 40));
    writeReport(SPEC, `blocks${blockCount}`, { jsPerKey: js / KEYS, summary, selfTop: self.slice(0, 40), totalTop: total.slice(0, 60) });
    expect(await editor.textContent()).toContain("b".repeat(KEYS));
  });
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   heldKey.spec.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 22:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// A held Backspace or Space "struggles to advance" (user, 2026-10-29) while one awaited press
// paints at the floor (blockEditOps.spec). This holds the key the way the OS does: auto-repeat
// key events every REPEAT_MS, never waiting for the page, so any per-key work longer than the
// interval queues and shows up as input delay. No budget: it reports input delay per key,
// frame intervals, long animation frames with their scripts, and a CPU profile.
// Caveat: headless software rendering in docker, no collab/bridge; a live number can be worse.

import { expect, test } from "@playwright/test";

import { PERF_USE, bootApp, summarize, writeReport } from "./perfHarness.mjs";
import { aggregateProfile, formatTop, profileDuring } from "./perfProfile.mjs";

test.use(PERF_USE);

const SPEC = "held-key";
const REPEAT_MS = 33; // ~30 Hz, the common desktop auto-repeat rate
const PRESSES = 90;
const LONG_TEXT = "lorem ipsum dolor sit amet ".repeat(8).trim();

const KEYS = {
  Backspace: { type: "rawKeyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
  Space: { type: "keyDown", key: " ", code: "Space", text: " ", unmodifiedText: " ", windowsVirtualKeyCode: 32 },
};

function installRecorder() {
  const rec = { keys: [], frames: [], loafs: [] };
  globalThis.__held = rec;
  document.addEventListener("keydown", (event) => {
    rec.keys.push({ delay: performance.now() - event.timeStamp });
  }, true);
  const frame = (now) => { rec.frames.push(now); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  if (!PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) return;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      rec.loafs.push({
        duration: Math.round(entry.duration),
        blocking: Math.round(entry.blockingDuration),
        layout: Math.round(entry.startTime + entry.duration - (entry.styleAndLayoutStart || entry.startTime + entry.duration)),
        scripts: entry.scripts.map((script) => ({
          invoker: script.invoker,
          fn: script.sourceFunctionName,
          ms: Math.round(script.duration),
          forcedLayout: Math.round(script.forcedStyleAndLayoutDuration),
        })),
      });
    }
  }).observe({ type: "long-animation-frame" });
}

// Firefox has no CDP: keyboard.down on a held key sends repeat keydowns, each awaited only to
// dispatch, so the pacing slips by whatever the page blocks; that slip is reported as lag.
async function holdKeyPlaywright(page, name) {
  const key = KEYS[name].key === " " ? "Space" : KEYS[name].key;
  const started = Date.now();
  for (let index = 0; index < PRESSES; index += 1) {
    await page.keyboard.down(key);
    const wait = started + (index + 1) * REPEAT_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
  await page.keyboard.up(key);
  return Date.now() - started - PRESSES * REPEAT_MS;
}

async function holdKeyCdp(page, name) {
  const cdp = await page.context().newCDPSession(page);
  const params = KEYS[name];
  const sent = [];
  for (let index = 0; index < PRESSES; index += 1) {
    sent.push(cdp.send("Input.dispatchKeyEvent", { ...params, autoRepeat: index > 0 }));
    await new Promise((resolve) => setTimeout(resolve, REPEAT_MS));
  }
  await Promise.all(sent);
  await cdp.send("Input.dispatchKeyEvent", { ...params, type: "keyUp", text: undefined });
  await cdp.detach();
  return 0;
}

function frameIntervals(frames) {
  return frames.slice(1).map((time, index) => time - frames[index]);
}

async function heldCase(page, browserName, caseName, name) {
  await page.evaluate(installRecorder);
  let lagMs = 0;
  const hold = async () => { lagMs = await (browserName === "chromium" ? holdKeyCdp : holdKeyPlaywright)(page, name); };
  const profile = browserName === "chromium" ? await profileDuring(page, hold) : (await hold(), null);
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
  const rec = await page.evaluate(() => globalThis.__held);
  const { totalMs, self, total } = profile ? aggregateProfile(profile) : { totalMs: 0, self: [], total: [] };
  const result = {
    browserName,
    lagMs,
    keysHandled: rec.keys.length,
    inputDelay: summarize(rec.keys.map((key) => key.delay)),
    frameInterval: summarize(frameIntervals(rec.frames)),
    longFrames: rec.loafs.length,
    worstFrames: rec.loafs.sort((a, b) => b.duration - a.duration).slice(0, 8),
  };
  caseName = `${browserName}.${caseName}`;
  console.log(`\n=== ${SPEC} / ${caseName}\n${JSON.stringify(result, null, 1)}`);
  console.log(formatTop(self, 25));
  console.log(`--- total ms (top 40) ---`);
  console.log(formatTop(total, 40));
  writeReport(SPEC, caseName, { ...result, totalMs, selfTop: self.slice(0, 60), totalTop: total.slice(0, 80) });
  expect(rec.keys.length).toBe(PRESSES);
}

async function caretAtEndOfLastBlock(page, count) {
  const pageId = await page.evaluate(({ n, text }) => globalThis.__perfOpenBlockPage(n, text), { n: count, text: LONG_TEXT });
  const last = page.locator(`[data-block-id="${pageId}-b${count - 1}"] [role="textbox"]`);
  await last.click();
  await page.keyboard.press("End");
  return pageId;
}

// workspacePages: a real workspace holds hundreds to thousands of pages, and a keystroke
// replaces the workspace's page array, so every page-store subscriber runs per key.
for (const { blocks, workspacePages } of [{ blocks: 10, workspacePages: 0 }, { blocks: 40, workspacePages: 0 }, { blocks: 40, workspacePages: 3000 }]) {
  for (const name of ["Backspace", "Space"]) {
    test(`held ${name}, ${blocks} blocks, ${workspacePages} workspace pages`, async ({ page, browserName }) => {
      test.setTimeout(180_000);
      await bootApp(page);
      if (workspacePages) await page.evaluate((n) => globalThis.__perfSeedPages(n), workspacePages);
      await caretAtEndOfLastBlock(page, blocks);
      await heldCase(page, browserName, `${name}.blocks${blocks}.pages${workspacePages}`, name);
    });
  }
}

// Live co-editing latency: the owner types N characters into a shared block, the member's DOM
// is observed. Reports loss, p50/p95 key-to-DOM and per-hop ms to
// test-results/latency/coedit-latency.json. It ASSERTS NOTHING about speed (C13): the p95 gate
// is enabled only after a measured baseline exists. It fails only when its own setup cannot
// run (no login, page not found), never on a slow or lossy result - those are the finding.
//
// Needs a bridge with two real accounts that share one page the owner may edit. Inputs (env;
// names only, values are never printed):
//   COEDIT_API_URL        bridge origin (default PLAYWRIGHT_API_URL, then PLAYWRIGHT_BASE_URL)
//   COEDIT_OWNER_EMAIL / COEDIT_OWNER_PASSWORD, COEDIT_MEMBER_EMAIL / COEDIT_MEMBER_PASSWORD
//   COEDIT_PAGE_TITLE     title of the shared page, found in the explorer of both users
//   COEDIT_CHARS (100), COEDIT_INTERVAL_MS (150), COEDIT_SETTLE_MS (15000)
// Against a deployed site: PLAYWRIGHT_BASE_URL=<site> PLAYWRIGHT_REUSE_EXISTING_SERVER=1.
// Run: PLAYWRIGHT_COEDIT=1 pnpm test:e2e:coedit (see docs/coedit-latency.md).
//
// Caveat: both users run in one Chromium on one machine, so the clock is shared and the
// result is the system's latency for same-host peers; it says nothing about two remote
// peers. Per-hop numbers need the bridge flag COLLAB_SERVER_TIMING=1 and a client carrying
// collabLatencyMarks.ts; a hop that is unavailable is reported null, never zero.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { analyse, analysePairs } from "./latencyStats.mjs";
import {
  BLOCK,
  visibleBlocks,
  bridgeSession,
  env,
  intEnv,
  getUsers,
  openAs,
  startKeyLog,
  watchEventPosts,
  startObservingAll,
  readUserData,
  appendBlocks,
  waitForBlockCounts,
  waitForPresence,
} from "./coeditPeers.mjs";

const CHARS = intEnv("COEDIT_CHARS", 100);
const INTERVAL_MS = intEnv("COEDIT_INTERVAL_MS", 150);
const SETTLE_MS = intEnv("COEDIT_SETTLE_MS", 15_000);
const REPORT = path.join("test-results", "latency", "coedit-latency.json");
const REPORT_N = path.join("test-results", "latency", "coedit-latency-n.json");
const missing = ["COEDIT_OWNER_EMAIL", "COEDIT_OWNER_PASSWORD", "COEDIT_MEMBER_EMAIL", "COEDIT_MEMBER_PASSWORD", "COEDIT_PAGE_TITLE"].filter((name) => !env(name));

/** In the member page: record the block's text length every time the DOM mutates. */
async function startObserving(page) {
  await page.evaluate((selector) => {
    const samples = [];
    const read = () => Array.from(document.querySelectorAll(selector)).find((block) => block.checkVisibility())?.textContent?.length ?? 0;
    let last = read();
    const now = () => performance.timeOrigin + performance.now();
    globalThis.__coeditSamples = samples;
    globalThis.__coeditBaseLen = last;
    new MutationObserver(() => {
      const len = read();
      if (len !== last) { last = len; samples.push({ t: now(), len }); }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  }, BLOCK);
}

async function readMarks(page) {
  return page.evaluate(() => {
    const epoch = (entry) => performance.timeOrigin + entry.startTime;
    return {
      samples: globalThis.__coeditSamples,
      baseLen: globalThis.__coeditBaseLen,
      frames: performance.getEntriesByName("collab:frame").map(epoch),
      doms: performance.getEntriesByName("collab:dom").map(epoch),
    };
  });
}

test("owner types, member observes: loss, p50, p95 and per-hop latency", async ({ browser, baseURL }) => {
  test.skip(missing.length > 0, `needs ${missing.join(", ")}`);
  test.setTimeout(CHARS * INTERVAL_MS + SETTLE_MS + 120_000);
  const apiUrl = (env("COEDIT_API_URL") || env("PLAYWRIGHT_API_URL") || baseURL).replace(/\/$/, "");
  const [ownerRecord, memberRecord] = await Promise.all([
    bridgeSession(apiUrl, env("COEDIT_OWNER_EMAIL"), env("COEDIT_OWNER_PASSWORD")),
    bridgeSession(apiUrl, env("COEDIT_MEMBER_EMAIL"), env("COEDIT_MEMBER_PASSWORD")),
  ]);
  const owner = await openAs(browser, baseURL, ownerRecord, false);
  const member = await openAs(browser, baseURL, memberRecord, true);
  try {
    const posts = watchEventPosts(owner.page);
    await startObserving(member.page);
    await visibleBlocks(owner.page).first().click();
    await owner.page.keyboard.press("Control+End");
    // After the caret move: its two keydowns would shift every key-to-DOM pair by two keys.
    await startKeyLog(owner.page);

    for (let index = 0; index < CHARS; index += 1) {
      await owner.page.keyboard.press(String.fromCharCode(97 + (index % 26)));
      await owner.page.waitForTimeout(INTERVAL_MS);
    }
    const settleBy = Date.now() + SETTLE_MS;
    let marks = await readMarks(member.page);
    while (Date.now() < settleBy && (marks.samples.at(-1)?.len ?? marks.baseLen) < marks.baseLen + CHARS) {
      await member.page.waitForTimeout(250);
      marks = await readMarks(member.page);
    }
    await owner.page.waitForTimeout(500); // let the last POST's response land in `posts`

    const keys = await owner.page.evaluate(() => globalThis.__coeditKeys);
    const result = analyse({ keys, samples: marks.samples, baseLen: marks.baseLen, posts, frames: marks.frames, doms: marks.doms });
    const report = {
      measuredAt: new Date().toISOString(),
      target: baseURL,
      config: { chars: CHARS, intervalMs: INTERVAL_MS, settleMs: SETTLE_MS },
      marksAvailable: marks.frames.length > 0,
      serverTimingAvailable: posts.some((post) => Object.keys(post.serverTiming).length > 0),
      ...result,
    };
    mkdirSync(path.dirname(REPORT), { recursive: true });
    writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`coedit-latency: sent ${result.sent}, lost ${result.lost}, key-to-DOM ${JSON.stringify(result.keyToDomMs)} -> ${REPORT}`);
    expect(result.sent, "the owner's keystrokes were logged").toBe(CHARS);
  } finally {
    await owner.context.close();
    await member.context.close();
  }
});

const nUsers = getUsers();
const nMissing = [];
if (!env("COEDIT_PAGE_TITLE")) nMissing.push("COEDIT_PAGE_TITLE");
if (nUsers.length < 3) nMissing.push("COEDIT_OWNER_/MEMBER_/USER_3..6 (need at least 3 users)");
test("N peers: presence, then all-pairs key-to-DOM", async ({ browser, baseURL }) => {
  test.skip(nMissing.length > 0, `needs ${nMissing.join(", ")}`);
  test.setTimeout(CHARS * INTERVAL_MS + SETTLE_MS + 180_000);
  const users = nUsers;
  const apiUrl = (env("COEDIT_API_URL") || env("PLAYWRIGHT_API_URL") || baseURL).replace(/\/$/, "");
  const records = await Promise.all(users.map((user) => bridgeSession(apiUrl, user.email, user.password)));
  const opened = await Promise.all(users.map((user, index) => openAs(browser, baseURL, records[index], false)));
  const userPages = users.map((user, index) => ({
    ...user,
    context: opened[index].context,
    page: opened[index].page,
    posts: watchEventPosts(opened[index].page),
  }));
  try {
    const presenceResults = await Promise.all(userPages.map(async (user) => {
      const result = await waitForPresence(user.page, users.length - 1, 15_000);
      return { label: user.label, seen: result.count, ms: result.ms };
    }));
    const presenceReport = {
      expected: users.length - 1,
      seen: Object.fromEntries(presenceResults.map((result) => [result.label, result.seen])),
      timeToPresenceMs: Object.fromEntries(presenceResults.map((result) => [result.label, result.ms])),
    };

    const initialCounts = await Promise.all(userPages.map((user) => visibleBlocks(user.page).count()));
    const initialMax = Math.max(...initialCounts);
    await appendBlocks(userPages[0].page, users.length);
    const totalBlocks = await waitForBlockCounts(userPages.map((user) => user.page), initialMax + users.length);
    userPages.forEach((user, index) => { user.blockIndex = totalBlocks - users.length + index; });
    await userPages[0].page.waitForTimeout(1_000);

    await Promise.all(userPages.map(async (user) => {
      await startObservingAll(user.page);
      await startKeyLog(user.page);
    }));
    await Promise.all(userPages.map(async (user) => {
      await visibleBlocks(user.page).nth(user.blockIndex).click();
    }));

    await Promise.all(userPages.map(async (user) => {
      for (let index = 0; index < CHARS; index += 1) {
        await user.page.keyboard.press(String.fromCharCode(97 + (index % 26)));
        await user.page.waitForTimeout(INTERVAL_MS);
      }
    }));

    await userPages[0].page.waitForTimeout(SETTLE_MS);

    const userData = await Promise.all(userPages.map(async (user) => {
      const data = await readUserData(user.page);
      return { label: user.label, blockIndex: user.blockIndex, posts: user.posts, keys: data.keys, blocks: data.blocks };
    }));

    const pairs = [];
    for (let typistIndex = 0; typistIndex < users.length; typistIndex += 1) {
      for (let observerIndex = 0; observerIndex < users.length; observerIndex += 1) {
        if (typistIndex === observerIndex) continue;
        const typist = userData[typistIndex];
        const observer = userData[observerIndex];
        const samples = observer.blocks.samples[typist.blockIndex] ?? [];
        const baseLen = observer.blocks.base[typist.blockIndex] ?? 0;
        pairs.push({
          typist: typist.label,
          observer: observer.label,
          keys: typist.keys,
          samples,
          baseLen,
          posts: typist.posts,
        });
      }
    }

    const result = analysePairs(pairs);
    const report = {
      measuredAt: new Date().toISOString(),
      target: baseURL,
      config: { chars: CHARS, intervalMs: INTERVAL_MS, settleMs: SETTLE_MS, peers: users.length },
      presence: presenceReport,
      pairs: result.pairs,
      aggregate: result.aggregate,
      slowest: result.slowest,
    };
    mkdirSync(path.dirname(REPORT_N), { recursive: true });
    writeFileSync(REPORT_N, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`coedit-latency-n: peers ${users.length}, pairs ${pairs.length} -> ${REPORT_N}`);
  } finally {
    await Promise.all(userPages.map((user) => user.context.close()));
  }
});

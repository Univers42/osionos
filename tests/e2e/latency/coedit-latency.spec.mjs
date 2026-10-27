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

import { explorerRow } from "../../browser/core/app.mjs";
import { analyse, parseServerTiming } from "./latencyStats.mjs";

const env = (name) => process.env[name] ?? "";
const intEnv = (name, fallback) => Number.parseInt(env(name), 10) || fallback;
const CHARS = intEnv("COEDIT_CHARS", 100);
const INTERVAL_MS = intEnv("COEDIT_INTERVAL_MS", 150);
const SETTLE_MS = intEnv("COEDIT_SETTLE_MS", 15_000);
const BLOCK = '[role="textbox"][aria-multiline="true"]';
const REPORT = path.join("test-results", "latency", "coedit-latency.json");
const missing = ["COEDIT_OWNER_EMAIL", "COEDIT_OWNER_PASSWORD", "COEDIT_MEMBER_EMAIL", "COEDIT_MEMBER_PASSWORD", "COEDIT_PAGE_TITLE"].filter((name) => !env(name));

test.skip(missing.length > 0, `needs ${missing.join(", ")}`);

async function bridgeSession(apiUrl, email, password) {
  const response = await fetch(`${apiUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`bridge login failed for ${email}: HTTP ${response.status}`);
  const body = await response.json();
  return {
    ok: true,
    persona: { id: body.session.userId, email, password: "", name: email.split("@")[0], emoji: "T", roleBadge: "", persistInSessions: true },
    session: body.session,
    expiresAt: body.expiresAt,
  };
}

/** A signed-in context whose page has the shared block open. `timing` turns the client marks on. */
async function openAs(browser, baseURL, record, timing) {
  const context = await browser.newContext({ baseURL });
  await context.addInitScript(([record_, timing_]) => {
    localStorage.setItem("osionos:bridge-session", JSON.stringify({ [record_.session.userId]: record_ }));
    if (timing_) localStorage.setItem("osio:collab-timing", "1");
  }, [record, timing]);
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await explorerRow(page, env("COEDIT_PAGE_TITLE")).click();
  await page.locator(BLOCK).first().waitFor({ timeout: 30_000 });
  return { context, page };
}

/** In the member page: record the block's text length every time the DOM mutates. */
async function startObserving(page) {
  await page.evaluate((selector) => {
    const samples = [];
    const read = () => document.querySelector(selector)?.textContent?.length ?? 0;
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

/** In the owner page: epoch time of every keydown while typing. */
async function startKeyLog(page) {
  await page.evaluate(() => {
    globalThis.__coeditKeys = [];
    document.addEventListener("keydown", () => globalThis.__coeditKeys.push(performance.timeOrigin + performance.now()), true);
  });
}

function watchEventPosts(page) {
  const posts = [];
  page.on("requestfinished", async (request) => {
    if (request.method() !== "POST" || !/\/api\/collaboration\/[^/]+\/events$/.test(request.url())) return;
    const timing = request.timing();
    if (timing.responseEnd < 0) return;
    const headers = await (await request.response())?.allHeaders();
    posts.push({ start: timing.startTime, end: timing.startTime + timing.responseEnd, serverTiming: parseServerTiming(headers?.["server-timing"]) });
  });
  return posts;
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
    await startKeyLog(owner.page);
    await owner.page.locator(BLOCK).first().click();
    await owner.page.keyboard.press("Control+End");

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

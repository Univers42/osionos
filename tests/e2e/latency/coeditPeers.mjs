import { explorerRow } from "../../browser/core/app.mjs";
import { parseServerTiming } from "./latencyStats.mjs";

export const BLOCK = '[role="textbox"][aria-multiline="true"]';
/** The open page's blocks. Tabs stay mounted when hidden, so an unscoped BLOCK can match another tab's editor first. */
export const visibleBlocks = (page) => page.locator(BLOCK).filter({ visible: true });

export const env = (name) => process.env[name] ?? "";
export const intEnv = (name, fallback) => Number.parseInt(env(name), 10) || fallback;

export function getUsers() {
  const users = [];
  const ownerEmail = env("COEDIT_OWNER_EMAIL");
  const ownerPass = env("COEDIT_OWNER_PASSWORD");
  if (ownerEmail && ownerPass) users.push({ label: "u1", email: ownerEmail, password: ownerPass });
  const memberEmail = env("COEDIT_MEMBER_EMAIL");
  const memberPass = env("COEDIT_MEMBER_PASSWORD");
  if (memberEmail && memberPass) users.push({ label: "u2", email: memberEmail, password: memberPass });
  for (let i = 3; i <= 6; i += 1) {
    const email = env(`COEDIT_USER_${i}_EMAIL`);
    const password = env(`COEDIT_USER_${i}_PASSWORD`);
    if (email && password) users.push({ label: `u${i}`, email, password });
  }
  return users;
}

export async function bridgeSession(apiUrl, email, password) {
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
export async function openAs(browser, baseURL, record, timing) {
  const context = await browser.newContext({ baseURL });
  await context.addInitScript(([record_, timing_]) => {
    localStorage.setItem("osionos:bridge-session", JSON.stringify({ [record_.session.userId]: record_ }));
    if (timing_) localStorage.setItem("osio:collab-timing", "1");
  }, [record, timing]);
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // A peer lands in its own private workspace; a shared page is only in the explorer once its workspace is active.
  const workspaceId = env("COEDIT_WORKSPACE_ID");
  if (workspaceId) {
    await page.waitForFunction(() => Boolean(globalThis.__playgroundUserStore));
    await page.evaluate((id) => globalThis.__playgroundUserStore.getState().switchWorkspace(id), workspaceId);
  }
  await explorerRow(page, env("COEDIT_PAGE_TITLE")).click();
  await visibleBlocks(page).first().waitFor({ timeout: 30_000 });
  return { context, page };
}

export function watchEventPosts(page) {
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

/** Records every block's text length on each DOM mutation, indexed by block position at start. */
export async function startObservingAll(page) {
  await page.evaluate((selector) => {
    const blocks = () => Array.from(document.querySelectorAll(selector)).filter((block) => block.checkVisibility());
    const samples = [];
    const base = [];
    const last = [];
    blocks().forEach((block, index) => {
      const length = block.textContent?.length ?? 0;
      base[index] = length;
      last[index] = length;
      samples[index] = [];
    });
    globalThis.__coeditBlocks = { samples, base, last };
    new MutationObserver(() => {
      const found = blocks();
      found.forEach((block, index) => {
        if (index >= last.length) return;
        const length = block.textContent?.length ?? 0;
        if (length !== last[index]) {
          last[index] = length;
          samples[index].push({ t: performance.timeOrigin + performance.now(), len: length });
        }
      });
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  }, BLOCK);
}

/** Epoch time of every keydown in this page. */
export async function startKeyLog(page) {
  await page.evaluate(() => {
    globalThis.__coeditKeys = [];
    document.addEventListener("keydown", () => globalThis.__coeditKeys.push(performance.timeOrigin + performance.now()), true);
  });
}

export async function readUserData(page) {
  return page.evaluate(() => ({
    keys: globalThis.__coeditKeys ?? [],
    blocks: globalThis.__coeditBlocks ?? { samples: [], base: [] },
  }));
}

export async function appendBlocks(page, count) {
  await visibleBlocks(page).last().click();
  await page.keyboard.press("Control+End");
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
}

export async function waitForBlockCounts(pages, minCount) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const counts = await Promise.all(pages.map((page) => visibleBlocks(page).count()));
    if (counts.every((count) => count >= minCount) && new Set(counts).size === 1) return counts[0];
    await pages[0].waitForTimeout(250);
  }
  const finalCounts = await Promise.all(pages.map((page) => visibleBlocks(page).count()));
  throw new Error(`block counts did not sync: ${finalCounts.join(",")}`);
}

export async function readPresence(page) {
  const group = page.locator('[role="group"][aria-label*="in this space"]');
  if (await group.count()) {
    const label = await group.first().getAttribute("aria-label");
    const match = /^(\d+) other/.exec(label ?? "");
    if (match) return Number(match[1]);
  }
  const buttons = page.locator('button[aria-label*="in this space"], button[aria-label*="on this page"]');
  return await buttons.count();
}

export async function waitForPresence(page, expected, timeoutMs = 15_000) {
  const start = Date.now();
  let last = 0;
  while (Date.now() - start < timeoutMs) {
    const count = await readPresence(page);
    if (count !== null) last = count;
    if (count !== null && count >= expected) return { count, ms: Date.now() - start };
    await page.waitForTimeout(250);
  }
  return { count: last, ms: null };
}

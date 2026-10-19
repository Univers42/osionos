// A published page (/p/<token>) is read by anonymous visitors, and any account can publish one.
// An embed there must not mount a third-party frame or navigate to the embedded host until the
// reader clicks (devil C29): a live frame under our URL bar can show a fake login. Offline: the
// public-page API (a bridge URL is set, see PLAYWRIGHT_BRIDGE_STUB) and every external host are answered by the test, and nothing leaves the machine.

import { expect, test } from "@playwright/test";

import { stubBridge } from "../support/bridgeStub.mjs";

const TOKEN = "0123456789abcdef0123456789abcdef";
const GENERIC = "https://generic-embed.test/app";
const CODEPEN = "https://codepen.io/team/pen/abcDEF";
const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const WATCHED_HOSTS = new Set(["generic-embed.test", "codepen.io"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

const PAGE = {
  ok: true, title: "Published", icon: null, publishedAt: "2026-10-19T00:00:00.000Z",
  content: [
    { id: "g1", type: "embed", content: GENERIC },
    { id: "c1", type: "embed", content: CODEPEN },
    { id: "y1", type: "embed", content: YOUTUBE },
  ],
};

// A request the page makes to a watched host, by resource type. `document` is a frame navigation.
async function openPublicPage(page) {
  const toWatchedHosts = [];
  page.on("request", (request) => {
    if (WATCHED_HOSTS.has(new URL(request.url()).hostname)) toWatchedHosts.push(request.resourceType());
  });
  await page.route(
    (url) => !LOCAL_HOSTS.has(url.hostname),
    (route) => route.fulfill({ status: 204 }),
  );
  await stubBridge(page, (url) => (url.pathname === `/api/public/pages/${TOKEN}` ? { json: PAGE } : undefined));
  await page.goto(`/p/${TOKEN}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Published" })).toBeVisible();
  return toWatchedHosts;
}

test.describe("C29: a published page frames nothing until the reader clicks", () => {
  test("generic, CodePen and YouTube embeds render as cards and a facade, with no frame and no navigation", async ({ page }) => {
    const toWatchedHosts = await openPublicPage(page);
    const play = page.getByRole("button", { name: /^Play .* on youtube/i });
    await expect(play).toBeVisible();
    await expect(page.locator('a[href^="https://generic-embed.test/app"]').first()).toBeVisible();
    await expect(page.locator('a[href^="https://codepen.io/team/pen/abcDEF"]').first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("iframe")).toHaveCount(0);
    expect(toWatchedHosts.filter((type) => type === "document")).toEqual([]);
    console.log(`C29 image requests to watched hosts: ${toWatchedHosts.filter((type) => type === "image").length}`);
    expect(toWatchedHosts.filter((type) => type !== "image")).toEqual([]);
  });

  test("clicking the YouTube facade mounts exactly one frame", async ({ page }) => {
    await openPublicPage(page);
    await page.getByRole("button", { name: /^Play .* on youtube/i }).click();
    await expect(page.locator("iframe")).toHaveCount(1);
    await expect(page.locator("iframe")).toHaveAttribute("src", /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  });
});

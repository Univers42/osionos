// The empty-page starter (ADR 0064 PS19): offered to the owner of an empty page only
// once the server's copy says it is empty, a shell lands in one undo step, and showing
// the catalogue never POSTs a page (PS18). "Save as shell" and "Save section" create
// template pages; a saved section is listed under "My sections".

/* global sessionStorage, localStorage */

import { setTimeout as sleep } from "node:timers/promises";

import { expect, test } from "@playwright/test";

import { explorerRow, slashCommandEntry } from "../../browser/core/app.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";
import { WS } from "../support/buttonProgramSeed.mjs";

const PAGE_ID = "65a0000000000000000000a1";
const HOST = { _id: PAGE_ID, title: "Shell host", workspaceId: WS, ownerId: "mock-user-0", visibility: "private", collaborators: [], parentPageId: null, databaseId: null, archivedAt: null };

/** Answers the page GET after `delayMs` (with `updatedAt` when given), records POSTs, accepts PATCHes. */
async function bridge(page, { content = [], delayMs = 0, updatedAt } = {}) {
  const posts = [];
  await stubBridge(page, async (url, request) => {
    if (url.pathname === `/api/pages/${PAGE_ID}` && request.method() === "GET") {
      await sleep(delayMs);
      return { json: { ...HOST, content, contentVersion: 1, ...(updatedAt ? { updatedAt } : {}) } };
    }
    if (url.pathname === "/api/pages" && request.method() === "POST") {
      const body = request.postDataJSON();
      posts.push(body);
      return { json: { ...body, _id: `65a0000000000000000000b${posts.length}`, workspaceId: WS, ownerId: "mock-user-0" } };
    }
    if (request.method() === "PATCH") return { json: { version: 2 } };
    return request.method() === "GET" ? { json: [] } : undefined;
  });
  return posts;
}

// Shells ship with the layout rendering (ADR 0064 PS10): the flag is on unless `layoutModes` is false.
async function openHost(page, baseURL, content = [], layoutModes = true) {
  await page.addInitScript(({ host, ws, blocks, on }) => {
    if (on) localStorage.setItem("osio.layout.modes", "1");
    else localStorage.removeItem("osio.layout.modes");
    if (sessionStorage.getItem("shells-seeded") !== null) return;
    sessionStorage.setItem("shells-seeded", "1");
    localStorage.setItem(`osio:pages:${ws}`, JSON.stringify([{ ...host, content: blocks }]));
    localStorage.setItem("pg:recents", "[]");
  }, { host: HOST, ws: WS, blocks: content, on: layoutModes });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await explorerRow(page, "Shell host").click();
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
}

const starter = (page) => page.getByTestId("shell-starter");

test("with osio.layout.modes off the empty page offers no shell", async ({ page, baseURL }) => {
  await bridge(page);
  await openHost(page, baseURL, [], false);
  await expect(page.getByRole("button", { name: /Click here to start writing/i })).toBeVisible();
  // Caveat: an absence check after a fixed 1.5 s; flag-on, the starter shows within the
  // stub's answer (the test below waits 800 ms for it), so a later regression could slip by.
  await page.waitForTimeout(1500);
  await expect(starter(page)).toHaveCount(0);
});

test("the starter waits for the server's copy, then a shell lands in one undo step", async ({ page, baseURL }) => {
  const posts = await bridge(page, { delayMs: 800 });
  await openHost(page, baseURL);
  await expect(page.getByRole("button", { name: /Click here to start writing/i })).toBeVisible();
  await expect(starter(page)).toHaveCount(0);
  await expect(starter(page)).toBeVisible();
  expect(posts).toHaveLength(0);
  await starter(page).getByRole("button", { name: /Landing page/ }).click();
  const body = page.locator(".osionos-page-body");
  await expect(body.getByText("Say what you do in one line")).toBeVisible();
  await expect(starter(page)).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(body.getByText("Say what you do in one line")).toHaveCount(0);
  await expect(starter(page)).toBeVisible();
  expect(posts).toHaveLength(0);
});

const FILLED = [{ id: "srv", type: "paragraph", content: "From the server" }];

test("a newer server copy with blocks replaces the empty local body, and no starter shows", async ({ page, baseURL }) => {
  await bridge(page, { content: FILLED, updatedAt: "2026-11-19T00:00:00.000Z" });
  await openHost(page, baseURL);
  await expect(page.locator(".osionos-page-body").getByText("From the server")).toBeVisible();
  await expect(starter(page)).toHaveCount(0);
});

// The fetch merge keeps an unpublished local [] over an older server copy, so the
// local body still reads as empty: the starter must not write over the server's blocks.
test("an unpublished empty local body over a server copy with blocks gets no starter (F12)", async ({ page, baseURL }) => {
  await bridge(page, { content: FILLED });
  const answered = page.waitForResponse((response) => response.url().endsWith(`/api/pages/${PAGE_ID}`) && response.request().method() === "GET");
  await openHost(page, baseURL);
  await answered;
  await expect(page.getByRole("button", { name: /Click here to start writing/i })).toBeVisible();
  for (let check = 0; check < 5; check += 1) {
    await expect(starter(page)).toHaveCount(0);
    await page.waitForTimeout(200);
  }
});

test("Save section stores a container as a template listed under My sections", async ({ page, baseURL }) => {
  const container = { id: "cl", type: "column_list", content: "", children: [
    { id: "c1", type: "column", content: "", children: [{ id: "h", type: "heading_3", content: "Our offer" }] },
    { id: "c2", type: "column", content: "", children: [{ id: "q", type: "paragraph", content: "Second" }] },
  ] };
  const posts = await bridge(page, { content: [container, { id: "tail", type: "paragraph", content: "" }] });
  await openHost(page, baseURL, [container, { id: "tail", type: "paragraph", content: "" }]);
  await page.locator('.osionos-page [data-block-id="cl"]').first().click({ button: "right", position: { x: 4, y: 4 } });
  await page.getByRole("menuitem", { name: "Save section" }).or(page.getByRole("button", { name: "Save section" })).first().click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ title: "Our offer", isTemplate: true, properties: [{ key: "osio-template-kind", value: "section" }] });
  expect(posts[0].content).toHaveLength(1);
  await page.locator('.osionos-page [data-block-id="tail"] [contenteditable="true"]').first().click();
  // The unfiltered menu shows group labels; a filtered one lists matches only.
  await page.keyboard.type("/");
  await expect(page.getByTestId("slash-command-menu").locator(".osio-menu-label", { hasText: "My sections" })).toBeVisible();
  await page.keyboard.type("Our offer");
  await expect(slashCommandEntry(page, "Our offer")).toBeVisible();
});

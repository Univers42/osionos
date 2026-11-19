// The '>' page commands (layoutPaletteCommands.ts): sections, shells and layout
// presets ride the layout-modes flag — with it off the palette lists none of them;
// with it on a shell fills an empty page in one commit (PATCHed through the
// bridge), a section lands after the page's own blocks, and a layout preset needs
// one selected column list before it changes anything.

/* global sessionStorage, localStorage */

import { expect, test } from "@playwright/test";

import { explorerRow } from "../../browser/core/app.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";
import { WS } from "../support/buttonProgramSeed.mjs";

const PAGE_ID = "65a0000000000000000000c1";
const HOST = { _id: PAGE_ID, title: "Palette host", workspaceId: WS, ownerId: "mock-user-0", visibility: "private", collaborators: [], parentPageId: null, databaseId: null, archivedAt: null };

/** Answers the page GET, records the PATCHes the outbox sends, accepts them. */
async function bridge(page, { content = [] } = {}) {
  const patches = [];
  await stubBridge(page, async (url, request) => {
    if (url.pathname === `/api/pages/${PAGE_ID}` && request.method() === "GET") {
      return { json: { ...HOST, content, contentVersion: 1 } };
    }
    if (request.method() === "PATCH") {
      patches.push({ pathname: url.pathname, body: request.postDataJSON() });
      return { json: { version: 2 } };
    }
    return request.method() === "GET" ? { json: [] } : undefined;
  });
  return patches;
}

// The page commands ship with the layout rendering (ADR 0064 PS10): the flag is
// on unless `layoutModes` is false.
async function openHost(page, baseURL, content = [], layoutModes = true) {
  await page.addInitScript(({ host, ws, blocks, on }) => {
    if (on) localStorage.setItem("osio.layout.modes", "1");
    else localStorage.removeItem("osio.layout.modes");
    if (sessionStorage.getItem("palette-seeded") !== null) return;
    sessionStorage.setItem("palette-seeded", "1");
    localStorage.setItem(`osio:pages:${ws}`, JSON.stringify([{ ...host, content: blocks }]));
    localStorage.setItem("pg:recents", "[]");
  }, { host: HOST, ws: WS, blocks: content, on: layoutModes });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await explorerRow(page, "Palette host").click();
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
}

const paletteInput = (page) => page.getByRole("combobox", { name: "Search pages or run a command" });
const body = (page) => page.locator(".osionos-page-body");
const HERO_TITLE = "Say what you do in one line";
const KEEP = [{ id: "keep", type: "paragraph", content: "Keep me" }];

test("with the flag off '>' lists no section or shell command", async ({ page, baseURL }) => {
  await bridge(page);
  await openHost(page, baseURL, [], false);
  const input = paletteInput(page);
  // A Settings row proves the '>' registry (settings and page commands land in one
  // state update) has settled, so the absences below are not read against a list
  // still waiting for its async half.
  await input.fill(">notif");
  await expect(page.getByRole("option", { name: /Settings: Notifications/ }).first()).toBeVisible();
  await input.fill(">Insert section");
  // Retried against the ">notif" rows: a zero-option list can only be this query's.
  await expect(page.locator("#osio-topbar-results").getByRole("option")).toHaveCount(0);
  await expect(page.getByRole("option", { name: /^Insert section:/ })).toHaveCount(0);
  await input.fill(">Apply shell");
  // Caveat: an absence check after a fixed 500 ms — this query's zero-option list
  // is indistinguishable from the one ">Insert section" left behind until the
  // re-render lands, so the wait, not the assert, owns that race.
  await page.waitForTimeout(500);
  await expect(page.getByRole("option", { name: /^Apply shell:/ })).toHaveCount(0);
});

test("'>' applies a shell to the empty page, closes the palette and PATCHes its content", async ({ page, baseURL }) => {
  const patches = await bridge(page);
  await openHost(page, baseURL);
  // The page commands run against the focused editor: give the empty body one.
  await page.getByRole("button", { name: /Click here to start writing/i }).click();
  const input = paletteInput(page);
  await input.fill(">Apply shell: Landing page");
  await expect(page.getByRole("option", { name: "Apply shell: Landing page" })).toBeVisible();
  await input.press("Enter");
  await expect(body(page).getByText(HERO_TITLE)).toBeVisible();
  await expect(input).toHaveAttribute("aria-expanded", "false");
  const carried = () => patches.some(({ pathname, body: sent }) =>
    pathname === `/api/pages/${PAGE_ID}` && JSON.stringify(sent?.content ?? []).includes(HERO_TITLE));
  await expect.poll(carried).toBe(true);
});

test("'>' inserts a section below the page's own blocks", async ({ page, baseURL }) => {
  await bridge(page, { content: KEEP });
  await openHost(page, baseURL, KEEP);
  await expect(body(page).getByText("Keep me")).toBeVisible();
  // The commands run against the focused editor: caret into the paragraph first.
  await page.locator('.osionos-page [data-block-id="keep"] [contenteditable="true"]').first().click();
  const input = paletteInput(page);
  await input.fill(">Insert section: Hero");
  await expect(page.getByRole("option", { name: "Insert section: Hero" })).toBeVisible();
  await input.press("Enter");
  const hero = body(page).getByText(HERO_TITLE);
  await expect(hero).toBeVisible();
  const keptTop = (await body(page).getByText("Keep me").boundingBox()).y;
  const heroTop = (await hero.boundingBox()).y;
  expect(heroTop).toBeGreaterThan(keptTop);
});

test("'>' refuses a shell on a page that already has blocks", async ({ page, baseURL }) => {
  await bridge(page, { content: KEEP });
  await openHost(page, baseURL, KEEP);
  await page.locator('.osionos-page [data-block-id="keep"] [contenteditable="true"]').first().click();
  const input = paletteInput(page);
  await input.fill(">Apply shell: Landing page");
  await expect(page.getByRole("option", { name: "Apply shell: Landing page" })).toBeVisible();
  await input.press("Enter");
  // The toast proves the command ran and chose not to apply: the heading never
  // follows, so its absence below is checked after the decision, not before it.
  await expect(page.getByRole("status").filter({ hasText: "Shells fill an empty page" })).toBeVisible();
  await expect(body(page).getByText("Keep me")).toBeVisible();
  await expect(body(page).getByText(HERO_TITLE)).toHaveCount(0);
});

test("'>' without a selected column list refuses the layout preset", async ({ page, baseURL }) => {
  await bridge(page);
  await openHost(page, baseURL);
  await page.getByRole("button", { name: /Click here to start writing/i }).click();
  const input = paletteInput(page);
  await input.fill(">Layout: grid 3 columns");
  await expect(page.getByRole("option", { name: "Layout: grid 3 columns" })).toBeVisible();
  await input.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Select one column list first" })).toBeVisible();
});

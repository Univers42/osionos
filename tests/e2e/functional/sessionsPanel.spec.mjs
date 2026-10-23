/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sessionsPanel.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Sessions block of Settings → Profile. The offline build has no bridge, so it must say the
// list is unavailable without inventing a row. The grouped list, Revoke and "Log out of all
// devices" need a bridge origin: the build is made with PLAYWRIGHT_API_URL set to the dev
// server's own origin (no CORS preflight) and every /api call is answered by a route handler,
// like sign-out-everywhere.spec.ts. They skip in the offline build.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { closeSettings, openSettings, region, searchSettings } from "../support/settingsHelpers.mjs";

const API_URL = process.env.PLAYWRIGHT_API_URL ?? "";
const USER_ID = "user-sessions-panel";
const WORKSPACE = { _id: "ws-1", name: "Home", slug: "home", ownerId: USER_ID, memberIds: [USER_ID], settings: {} };
const CHROME = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const ELECTRON = `${CHROME} osionos/1.0 Electron/31.0.0`;
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";
const SESSION_ROWS = [
  { id: "11111111-1111-4111-8111-111111111111", userAgent: CHROME, current: true },
  { id: "22222222-2222-4222-8222-222222222222", userAgent: ELECTRON, current: false },
  { id: "33333333-3333-4333-8333-333333333333", userAgent: ANDROID, current: false },
].map((row) => ({
  createdAt: "2026-10-22T10:00:00.000Z", expiresAt: "2026-10-29T10:00:00.000Z", lastSeenAt: null,
  authMethod: "password", ipPrefix: "203.0.113.0/24", ...row,
}));

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const TOKEN = `osionos_v1.${base64url({ sub: USER_ID, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const SESSION_RECORD = {
  ok: true,
  persona: { id: USER_ID, email: "sessions@example.test", password: "", name: "Sessions", emoji: "S", roleBadge: "", persistInSessions: true },
  session: { userId: USER_ID, accessToken: TOKEN, refreshToken: "", privateWorkspaces: [WORKSPACE], sharedWorkspaces: [] },
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
};

async function openBridgedSessions(page, baseURL, { listStatus = 200 } = {}) {
  const calls = [];
  await page.addInitScript(([key, record]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ [record.session.userId]: record }));
  }, ["osionos:bridge-session", SESSION_RECORD]);
  await page.route(`${API_URL}/api/**`, (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    calls.push(`${request.method()} ${pathname}`);
    const reply = (status, body) => route.fulfill({ status, contentType: "application/json", body: body === undefined ? "" : JSON.stringify(body) });
    if (pathname === "/api/account/sessions") return listStatus === 200 ? reply(200, { sessions: SESSION_ROWS }) : reply(listStatus, { ok: false, code: "boom", message: "The list broke." });
    if (request.method() === "DELETE" && pathname.startsWith("/api/account/sessions/")) return reply(204);
    if (pathname === "/api/auth/bridge/logout") return reply(204);
    if (pathname === "/api/workspaces") return reply(200, [WORKSPACE]);
    return reply(200, []);
  });
  await openFreshPage(page, baseURL);
  await openSettings(page);
  await searchSettings(page, "sessions");
  return { calls, block: region(page).locator('[data-settings-anchor="sessions"]') };
}

test.describe("Sessions block (offline build)", () => {
  test("is there, labelled, and lists nothing it cannot know", async ({ page, baseURL }) => {
    test.skip(Boolean(API_URL), "a bridge build never shows the unavailable state");
    await openFreshPage(page, baseURL);
    await openSettings(page);
    await searchSettings(page, "sessions");
    const block = region(page).locator('[data-settings-anchor="sessions"]');
    await expect(block.getByRole("heading", { name: "Sessions", exact: true })).toBeVisible();
    await expect(block.getByText("Sessions can't be listed on this server")).toBeVisible();
    await expect(block.getByRole("button", { name: /^Revoke/ })).toHaveCount(0);
    await expect(block.getByRole("button", { name: "Log out of all devices" })).toBeVisible();
    await closeSettings(page);
  });
});

test.describe("Sessions block (bridge stub)", () => {
  test.skip(!API_URL, "offline build (VITE_API_URL unset) — set PLAYWRIGHT_API_URL to the dev server origin to run this");

  test("groups web, desktop and mobile, and Revoke calls the route with the session's id", async ({ page, baseURL }) => {
    const { calls, block } = await openBridgedSessions(page, baseURL);
    for (const group of ["Web", "Desktop", "Mobile"]) await expect(block.getByRole("heading", { name: group, exact: true })).toBeVisible();
    await expect(block.getByText("This device", { exact: true })).toBeVisible();

    await block.getByRole("button", { name: "Revoke session: Chrome on Android" }).click();
    await expect.poll(() => calls).toContain(`DELETE /api/account/sessions/${SESSION_ROWS[2].id}`);
    await expect(block.getByRole("heading", { name: "Mobile", exact: true })).toHaveCount(0);
  });

  test("Log out of all devices still calls the bridge logout", async ({ page, baseURL }) => {
    const { calls, block } = await openBridgedSessions(page, baseURL);
    await block.getByRole("button", { name: "Log out of all devices" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Log out of all devices" }).click();
    await expect.poll(() => calls).toContain("POST /api/auth/bridge/logout");
  });

  test("a failed list says so with a retry, and invents no row", async ({ page, baseURL }) => {
    const { block } = await openBridgedSessions(page, baseURL, { listStatus: 500 });
    await expect(block.getByRole("alert")).toBeVisible();
    await expect(block.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(block.locator("table tbody tr")).toHaveCount(0);
  });
});

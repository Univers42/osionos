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

// The Sessions block of Settings → Profile against a stubbed bridge (PLAYWRIGHT_BRIDGE_STUB=1, the
// only mode whose build has a bridge URL to stub): rows grouped web, desktop and mobile, Revoke
// one with a restore on failure and a local sign-out for the current row, and the existing
// "Log out of all devices". The offline build's "unavailable" state is in functional/.

import { test, expect } from "@playwright/test";

import { region } from "../support/settingsHelpers.mjs";
import { ANDROID, CHROME, ELECTRON, PAGE_JWT, openProfile, sessionRow, signedOutTokens, stubSessions } from "../support/sessionsStub.mjs";

const IDS = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const ROWS = [sessionRow(IDS[0], CHROME, { current: true }), sessionRow(IDS[1], ELECTRON), sessionRow(IDS[2], ANDROID)];

const block = (page) => region(page).locator('[data-settings-anchor="sessions"]');
const revokeButton = (page, name) => block(page).getByRole("button", { name: `Revoke session: ${name}`, exact: true });

test.describe("Sessions block (bridge stub)", () => {
  test("groups web, desktop and mobile and marks this device", async ({ page, baseURL }) => {
    await stubSessions(page, ROWS);
    await openProfile(page, baseURL);
    for (const group of ["Web", "Desktop", "Mobile"]) await expect(block(page).getByRole("heading", { name: group, exact: true })).toBeVisible();
    await expect(block(page).getByText("This device", { exact: true })).toBeVisible();
    await expect(block(page).locator("table tbody tr")).toHaveCount(ROWS.length);
  });

  test("Revoke calls the route with the session's id and drops the row", async ({ page, baseURL }) => {
    const bridge = await stubSessions(page, ROWS);
    await openProfile(page, baseURL);
    await revokeButton(page, "Chrome on Android").click();
    await expect(block(page).getByRole("heading", { name: "Mobile", exact: true })).toHaveCount(0);
    expect(bridge.deletes).toEqual([IDS[2]]);
    expect(await signedOutTokens(page)).toEqual([]);
  });

  test("a refused Revoke puts the row back", async ({ page, baseURL }) => {
    const bridge = await stubSessions(page, ROWS);
    bridge.failDelete = { status: 500, json: { ok: false, message: "boom", code: "server_error" } };
    await openProfile(page, baseURL);
    await revokeButton(page, "Chrome on Android").click();
    await expect(block(page).getByRole("heading", { name: "Mobile", exact: true })).toBeVisible();
    expect(bridge.deletes).toEqual([]);
    expect(await signedOutTokens(page)).toEqual([]);
  });

  test("revoking the current row signs this account out locally", async ({ page, baseURL }) => {
    const bridge = await stubSessions(page, ROWS);
    await openProfile(page, baseURL);
    await revokeButton(page, "Chrome on Linux (this device)").click();
    await expect.poll(() => signedOutTokens(page)).toEqual([PAGE_JWT]);
    expect(bridge.deletes).toEqual([IDS[0]]);
  });

  test("Log out of all devices still calls the bridge logout", async ({ page, baseURL }) => {
    const bridge = await stubSessions(page, ROWS);
    await openProfile(page, baseURL, { bridgeToken: "osionos_v1.e2e.sig" });
    await block(page).getByRole("button", { name: "Log out of all devices" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Log out of all devices" }).click();
    await expect.poll(() => bridge.logouts).toBe(1);
  });

  test("a failed list says so with a retry, and invents no row", async ({ page, baseURL }) => {
    const bridge = await stubSessions(page, ROWS);
    bridge.failList = { status: 500, json: { ok: false, message: "The list broke.", code: "server_error" } };
    await openProfile(page, baseURL);
    await expect(block(page).getByRole("alert")).toBeVisible();
    await expect(block(page).locator("table tbody tr")).toHaveCount(0);
    bridge.failList = null;
    await block(page).getByRole("button", { name: "Retry" }).click();
    await expect(block(page).locator("table tbody tr")).toHaveCount(ROWS.length);
  });

  test("an empty list says there are no other sessions", async ({ page, baseURL }) => {
    await stubSessions(page, []);
    await openProfile(page, baseURL);
    await expect(block(page).getByText("No other sessions")).toBeVisible();
  });
});

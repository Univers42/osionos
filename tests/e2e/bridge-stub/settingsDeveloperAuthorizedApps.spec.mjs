/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsDeveloperAuthorizedApps.spec.mjs           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
// Settings > Developer and authorized apps against a stubbed bridge
// (PLAYWRIGHT_BRIDGE_STUB=1, the only mode whose build has a bridge URL to stub): one row
// per token with its last use worded by the hour, revoke behind a confirmation, and the
// MCP preset that fills the form without creating anything.

import { test, expect } from "@playwright/test";

import { region } from "../support/settingsHelpers.mjs";
import { openDeveloper, stubTokens, tokenRow } from "../support/tokensStub.mjs";

const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const IDS = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const STAMPS = [ago(HOUR / 2), ago(4.5 * HOUR), null];
const ROWS = [
  tokenRow(IDS[0], "Claude Code", { lastUsedAt: STAMPS[0] }),
  tokenRow(IDS[1], "Backup script", { lastUsedAt: STAMPS[1] }),
  tokenRow(IDS[2], "Idle app"),
];
const WORDING = [["Claude Code", "Within the hour"], ["Backup script", "Last used within 5 hours"], ["Idle app", "Never used"]];

const panel = (page) => region(page).locator('[data-settings-panel="developer"]');

test.describe("settings authorized apps", () => {
  test("one row per token, each with its last use worded by the hour and never a timestamp", async ({ page, baseURL }) => {
    await stubTokens(page, ROWS);
    await openDeveloper(page, baseURL);
    await expect(panel(page).getByRole("row")).toHaveCount(ROWS.length + 1);
    for (const [name, wording] of WORDING) {
      await expect(panel(page).getByRole("row").filter({ hasText: name })).toContainText(wording);
    }
    for (const stamp of STAMPS.filter(Boolean)) await expect(panel(page)).not.toContainText(stamp.slice(11, 16));
    await expect(panel(page)).toContainText("accurate to the hour");
  });

  test("revoke asks first; a refused revoke keeps the row with an alert, a confirmed one removes it", async ({ page, baseURL }) => {
    const bridge = await stubTokens(page, ROWS);
    await openDeveloper(page, baseURL);
    await panel(page).getByRole("button", { name: "Revoke Idle app" }).click();
    expect(bridge.deletes).toEqual([]);
    bridge.failDelete = { status: 500, json: { ok: false, message: "boom", code: "server_error" } };
    await page.getByRole("dialog").getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    await expect(panel(page).getByRole("row")).toHaveCount(ROWS.length + 1);
    bridge.failDelete = null;
    await page.getByRole("dialog").getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(panel(page).getByRole("row")).toHaveCount(ROWS.length);
    expect(bridge.deletes).toEqual([IDS[2]]);
  });

  test("the MCP preset fills the form and says write includes archiving; nothing is created until Create", async ({ page, baseURL }) => {
    const bridge = await stubTokens(page, []);
    await openDeveloper(page, baseURL);
    await panel(page).getByRole("button", { name: "New token" }).click();
    await page.getByRole("button", { name: "osionos MCP (Claude Code)" }).click();
    await expect(page.getByLabel("Name")).toHaveValue("Claude Code (MCP)");
    await expect(page.getByRole("dialog")).toContainText("archiving pages");
    await expect(page.getByRole("dialog")).toContainText("title, icon, content");
    expect(bridge.posts).toEqual([]);
    await page.getByRole("button", { name: "Create token" }).click();
    await expect(page.getByLabel("Your new token")).toBeVisible();
    expect(bridge.posts).toHaveLength(1);
    expect(bridge.posts[0]).toMatchObject({ name: "Claude Code (MCP)", kind: "classic", scopes: ["pages:read", "pages:write"] });
    await expect(page.getByRole("dialog")).toContainText("OSIONOS_MCP_TOKEN");
  });

  test("every button in the panel and in the dialog has an accessible name", async ({ page, baseURL }) => {
    await stubTokens(page, ROWS);
    await openDeveloper(page, baseURL);
    await panel(page).getByRole("button", { name: "New token" }).click();
    const unnamed = await page.locator('[data-settings-panel="developer"] button, [role="dialog"] button').evaluateAll(
      (buttons) => buttons.filter((button) => !(button.getAttribute("aria-label") || button.textContent || "").trim()).length,
    );
    expect(unnamed).toBe(0);
  });
});

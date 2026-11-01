/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sysDataSources.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// P4-1-b: "My data" in the slash menu inserts a read-only `sys:` database. The offline
// harness has no bridge (VITE_API_URL is empty), so the cases that need real rows are gated
// on PLAYWRIGHT_API_URL and reported as skipped otherwise. Skipped is not passed.

import { test, expect } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  openSlashMenuFromEditor,
  slashCommandEntry,
} from "../../browser/core/app.mjs";
import { giveTheAppABridgeOrigin, stubRestOfTheBridge } from "../support/bridgeSession.mjs";
import { seedPage } from "../support/embedSeed.mjs";

const BRIDGED = !!process.env.PLAYWRIGHT_API_URL;
const block = (page, databaseId) => page.locator(`.osionos-database-block[data-database-id="${databaseId}"]`);

async function insertMyPages(page) {
  await openFreshPage(page, "/");
  const editor = await activateFirstEditor(page);
  await openSlashMenuFromEditor(editor, "/my");
  await slashCommandEntry(page, "My pages").click();
}

test.describe("sys data sources", () => {
  test("/my lists the My data group and inserts the sys: database", async ({ page }) => {
    await openFreshPage(page, "/");
    const editor = await activateFirstEditor(page);
    await openSlashMenuFromEditor(editor, "/my");
    for (const label of ["My pages", "My tasks", "Published pages", "Connections", "Followers", "My workspaces", "My sessions"]) {
      await expect(slashCommandEntry(page, label)).toBeVisible();
    }
    await slashCommandEntry(page, "My pages").click();
    const inserted = block(page, "sys:my-pages");
    await expect(inserted).toBeVisible({ timeout: 15_000 });
    await expect(inserted).toHaveAttribute("data-database-view-id", "my-pages-default");
  });

  // A failed read with a server offers Retry: bridge-stub/sysSavedViews.spec.mjs.
  test("a build with no server asks you to connect, with no Retry and never the demo seed", async ({ page }) => {
    test.skip(BRIDGED, "offline only: the bridge answers when PLAYWRIGHT_API_URL is set");
    await insertMyPages(page);
    const inserted = block(page, "sys:my-pages");
    await expect(inserted.getByRole("alert")).toContainText("Connect to see your pages.", { timeout: 15_000 });
    await expect(inserted.getByRole("button", { name: "Retry" })).toHaveCount(0);
    await expect(inserted.getByText("Untitled Database")).toHaveCount(0);
  });

  test("a sys: id that is not a shipped source falls through to today's behaviour", async ({ page }) => {
    await seedPage(page, "/", [{ id: "sys-unknown", type: "database_inline", content: "", databaseId: "sys:nope", viewId: "nope-default" }]);
    await expect(page.locator('.osionos-database-block[data-database-id="sys:nope"]')).toHaveCount(0);
  });

  test("no sys: key reaches the known-database store", async ({ page }) => {
    await insertMyPages(page);
    await expect(block(page, "sys:my-pages")).toBeVisible({ timeout: 15_000 });
    const keys = await page.evaluate(() =>
      Object.entries(localStorage).filter(([k, v]) => k.includes("knownDatabaseState") && v.includes("sys:")).map(([k]) => k));
    expect(keys).toEqual([]);
  });

  test("bridged: rows show, the request carries the session token, nothing is posted", async ({ page }) => {
    test.skip(!BRIDGED, "needs PLAYWRIGHT_API_URL (a bridge)");
    const posts = [];
    let auth = "";
    page.on("request", (req) => {
      if (req.url().includes("/api/account/self-data/")) auth = req.headers()["authorization"] ?? "";
      if (req.method() === "POST" && req.url().includes("/api/object-databases")) posts.push(req.postData() ?? "");
    });
    await insertMyPages(page);
    const inserted = block(page, "sys:my-pages");
    await expect(inserted.locator("tbody tr, [role=row]").first()).toBeVisible({ timeout: 15_000 });
    await expect(inserted.getByText("Untitled Database")).toHaveCount(0);
    expect(auth).toMatch(/^Bearer osionos_v1\./);
    expect(posts.filter((body) => body.includes("sys:"))).toEqual([]);
  });

  test("bridged: the truncated line shows only when the bridge says so", async ({ page }) => {
    test.skip(!BRIDGED, "needs PLAYWRIGHT_API_URL (a bridge)");
    await page.route("**/api/account/self-data/my-pages", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, truncated: true } });
    });
    await insertMyPages(page);
    await expect(block(page, "sys:my-pages").getByText("Showing your 200 most recent.")).toBeVisible({ timeout: 15_000 });
  });

  test("a my-followers block names each follower by their public card", async ({ page, baseURL }) => {
    const rows = [
      { follower_id: "u-ada", created_at: "2026-10-09T00:00:00Z", follower: { userId: "u-ada", name: "Ada Lovelace", username: "ada" } },
      { follower_id: "u-quiet", created_at: "2026-10-08T00:00:00Z", follower: { userId: "u-quiet", name: "Quiet Peer" } },
    ];
    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await stubRestOfTheBridge(page);
    await page.route("**/api/account/self-data/my-followers", (route) => route.fulfill({
      json: { ok: true, source: "my-followers", columns: ["follower_id", "created_at", "follower"], rows, truncated: false },
    }));
    await seedPage(page, "/", [{ id: "sys-followers", type: "database_inline", content: "", databaseId: "sys:my-followers", viewId: "my-followers-default" }]);
    const inserted = block(page, "sys:my-followers");
    await expect(inserted.getByText("Ada Lovelace")).toBeVisible({ timeout: 15_000 });
    await expect(inserted.getByText("Quiet Peer")).toBeVisible();
    await expect(inserted.getByText("u-ada")).toHaveCount(0);
    await expect(inserted.getByText("{")).toHaveCount(0);
  });

  test("a my-activity block on the chart view draws a chart from the stubbed answer, not a table", async ({ page, baseURL }) => {
    const rows = ["page.open", "page.open", "page.edit"].map((event, i) => ({ ts: `2026-10-0${i + 1}T00:00:00Z`, event, surface: "editor", workspace_id: "w" }));
    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await stubRestOfTheBridge(page);
    await page.route("**/api/account/self-data/my-activity", (route) => route.fulfill({
      json: { ok: true, source: "my-activity", columns: ["ts", "event", "surface", "workspace_id"], rows, truncated: false },
    }));
    await seedPage(page, "/", [{ id: "sys-chart", type: "database_inline", content: "", databaseId: "sys:my-activity", viewId: "my-activity-chart" }]);
    const inserted = block(page, "sys:my-activity");
    await expect(inserted).toHaveAttribute("data-database-view-id", "my-activity-chart", { timeout: 15_000 });
    await expect(inserted.locator(".recharts-surface, canvas, svg[role='img']").first()).toBeVisible({ timeout: 15_000 });
    await expect(inserted.locator("table, [role=grid]")).toHaveCount(0);
  });
});

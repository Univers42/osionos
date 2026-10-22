/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsBlockedUsers.spec.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

function region(page) {
  return page.getByRole("region", { name: "Settings", exact: true });
}

function nav(page) {
  return page.getByRole("navigation", { name: "Settings sections" });
}

function appErrors(consoleErrors) {
  return consoleErrors.filter((text) => !text.startsWith("Failed to load resource"));
}

async function giveTheAppABridgeOrigin(page, origin) {
  await page.route("**/src/shared/api/client.ts", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const patched = source.replace(/("VITE_API_URL":\s*)""/, `$1"${origin}"`);
    await route.fulfill({ response, body: patched });
  });
}

const BLOCK_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BLOCK_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const FIXTURE_BLOCKS = [
  { userId: BLOCK_A, name: "Ada", avatar: null, reason: "spam", createdAt: "2026-10-12T00:00:00.000Z" },
  { userId: BLOCK_B, name: "Bo", avatar: null, reason: null, createdAt: "2026-10-10T00:00:00.000Z" },
];

test.describe("the blocked users panel", () => {
  test("the nav shows Moderation and the panel lists both rows with names and dates", async ({ page, baseURL }) => {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await page.route("**/api/social/blocks", (route) =>
      route.fulfill({ json: { ok: true, blocks: FIXTURE_BLOCKS } }),
    );
    await page.route("**/api/social/blocks/*", (route) =>
      route.fulfill({ json: { ok: true, userId: BLOCK_A, unblocked: true } }),
    );

    await page.goto(new URL("/?settings=moderation#blocked-users", baseURL).toString());
    const r = region(page);
    await expect(r).toBeVisible();
    await expect(nav(page).getByRole("button", { name: "Moderation", exact: true })).toBeVisible();

    await expect(r.getByText("Ada")).toBeVisible();
    await expect(r.getByText(/^Bo(\s|$)/)).toBeVisible();
    await expect(r.getByText(/Blocked on 12 Oct 2026/)).toBeVisible();

    expect(appErrors(consoleErrors)).toEqual([]);
  });

  test("clicking Unblock opens the confirm; confirming calls DELETE and removes the row", async ({ page, baseURL }) => {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await page.route("**/api/social/blocks", (route) =>
      route.fulfill({ json: { ok: true, blocks: [{ userId: BLOCK_A, name: "Ada", avatar: null, reason: null, createdAt: "2026-10-12T00:00:00.000Z" }] } }),
    );
    let deleted = false;
    await page.route("**/api/social/blocks/*", (route) => {
      if (route.request().method() === "DELETE") deleted = true;
      return route.fulfill({ json: { ok: true, userId: BLOCK_A, unblocked: true } });
    });

    await page.goto(new URL("/?settings=moderation#blocked-users", baseURL).toString());
    const r = region(page);
    await expect(r).toBeVisible();
    await expect(r.getByText("Ada")).toBeVisible();

    await r.getByRole("button", { name: "Unblock", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Unblock Ada\?/)).toBeVisible();
    await dialog.getByRole("button", { name: "Unblock", exact: true }).click();

    await expect(r.getByText("Ada")).toHaveCount(0);
    expect(deleted).toBe(true);

    expect(appErrors(consoleErrors)).toEqual([]);
  });

  test("cancelling the confirm calls nothing and the row stays", async ({ page, baseURL }) => {
    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await page.route("**/api/social/blocks", (route) =>
      route.fulfill({ json: { ok: true, blocks: [{ userId: BLOCK_A, name: "Ada", avatar: null, reason: null, createdAt: "2026-10-12T00:00:00.000Z" }] } }),
    );
    let deleted = false;
    await page.route("**/api/social/blocks/*", (route) => {
      if (route.request().method() === "DELETE") deleted = true;
      return route.fulfill({ json: { ok: true, userId: BLOCK_A, unblocked: true } });
    });

    await page.goto(new URL("/?settings=moderation#blocked-users", baseURL).toString());
    const r = region(page);
    await expect(r).toBeVisible();
    await r.getByRole("button", { name: "Unblock", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();

    await expect(r.getByText("Ada")).toBeVisible();
    expect(deleted).toBe(false);
  });

  test("a 500 from the route shows the message in the panel and no console error", async ({ page, baseURL }) => {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await page.route("**/api/social/blocks", (route) =>
      route.fulfill({ status: 500, json: { ok: false, message: "boom" } }),
    );
    await page.route("**/api/social/blocks/*", (route) =>
      route.fulfill({ status: 500, json: { ok: false, message: "boom" } }),
    );

    await page.goto(new URL("/?settings=moderation#blocked-users", baseURL).toString());
    const r = region(page);
    await expect(r).toBeVisible();
    await expect(r.getByText("boom")).toBeVisible();

    expect(appErrors(consoleErrors)).toEqual([]);
  });

  test("the empty fixture shows the empty copy", async ({ page, baseURL }) => {
    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await page.route("**/api/social/blocks", (route) =>
      route.fulfill({ json: { ok: true, blocks: [] } }),
    );
    await page.route("**/api/social/blocks/*", (route) =>
      route.fulfill({ json: { ok: true } }),
    );

    await page.goto(new URL("/?settings=moderation#blocked-users", baseURL).toString());
    const r = region(page);
    await expect(r).toBeVisible();
    await expect(r.getByText("You haven't blocked anyone.")).toBeVisible();
    await expect(r.getByText("Blocking someone hides them from your directory and your connections, and stops their messages. They are not told.")).toBeVisible();
  });

  test("at 375px the list does not overflow the settings pane", async ({ page, baseURL }) => {
    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await page.route("**/api/social/blocks", (route) =>
      route.fulfill({ json: { ok: true, blocks: FIXTURE_BLOCKS } }),
    );
    await page.route("**/api/social/blocks/*", (route) =>
      route.fulfill({ json: { ok: true } }),
    );

    await page.goto(new URL("/?settings=moderation#blocked-users", baseURL).toString());
    await page.setViewportSize({ width: 375, height: 812 });
    const r = region(page);
    await expect(r).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

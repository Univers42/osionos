/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   connectivity.spec.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #176: nothing told a user the connection was gone or flaky, and an edit made offline
// waited for the outbox's next backoff (15 s, doubling to 2 min) after the network came
// back. Runs against a stubbed bridge (PLAYWRIGHT_BRIDGE_STUB=1) that the test can cut.

import { expect, test } from "@playwright/test";

import { clearAndTypePageTitle, explorerRow } from "../../browser/core/app.mjs";
import { BRIDGE_STUB_ORIGIN, stubBridge } from "../support/bridgeStub.mjs";

const WS = "mock-ws-private-0";
// A server id: the outbox publishes only pages the server knows (isPersistedPageId).
const PAGE_ID = "6a1760000000000000000176";

/** The outbox writes the bridge took, and a switch that cuts it off the network. */
async function stubPages(page) {
  const writes = [];
  const bridge = { down: false };
  await stubBridge(page, (url, request) => {
    if (request.method() !== "PATCH" || url.pathname !== `/api/pages/${PAGE_ID}`) return undefined;
    writes.push(request.postData() ?? "");
    return { json: { version: writes.length } };
  });
  // Registered last, so it runs first: while the bridge is down nothing reaches the stub.
  await page.route(`${BRIDGE_STUB_ORIGIN}/**`, (route) => (bridge.down ? route.abort("internetdisconnected") : route.fallback()));
  return { writes, bridge };
}

async function openSeededPage(page, baseURL) {
  await page.addInitScript(({ ws, id }) => {
    if (sessionStorage.getItem("connectivity-seeded") !== null) return;
    sessionStorage.setItem("connectivity-seeded", "1");
    localStorage.setItem(`osio:pages:${ws}`, JSON.stringify([{
      _id: id, title: "Field notes", workspaceId: ws, ownerId: "mock-user-0", visibility: "private",
      collaborators: [], parentPageId: null, databaseId: null, archivedAt: null, content: [],
    }]));
    localStorage.setItem("pg:recents", "[]");
  }, { ws: WS, id: PAGE_ID });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await explorerRow(page, "Field notes").click();
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
}

const chip = (page) => page.getByTestId("connectivity-chip");

test.describe("connection notices", () => {
  test("offline: says so, keeps the edit, and sends it the moment the connection is back", async ({ page, context, baseURL }) => {
    const { writes, bridge } = await stubPages(page);
    await openSeededPage(page, baseURL);
    await expect(chip(page)).toHaveCount(0);
    // The dev server sends the app module by module; cut the network only once it has all
    // of them, as for someone already working when the connection drops.
    await page.waitForLoadState("networkidle");

    bridge.down = true;
    await context.setOffline(true);
    await expect(chip(page)).toHaveText("Offline");
    await expect(page.getByText("You're offline")).toBeVisible();

    await clearAndTypePageTitle(page, "Field notes, written offline");
    const sent = () => writes.filter((body) => body.includes("Field notes, written offline"));
    // The outbox has tried and failed by now; its own retry is 15 s away.
    await page.waitForTimeout(2_000);
    expect(sent()).toHaveLength(0);

    bridge.down = false;
    await context.setOffline(false);
    await expect(page.getByText("Back online")).toBeVisible();
    await expect(chip(page)).toHaveCount(0);
    await expect.poll(() => sent().length, { timeout: 5_000 }).toBe(1);
  });

  test("a bridge that stops answering reads as an unstable connection until it answers again", async ({ page, baseURL }) => {
    const { bridge } = await stubPages(page);
    await openSeededPage(page, baseURL);

    bridge.down = true;
    await page.getByRole("tab", { name: /^Notifications/ }).click();
    await expect(chip(page)).toHaveText("Connection unstable");
    await expect(page.getByText("The connection to the server is unstable")).toBeVisible();

    bridge.down = false;
    await clearAndTypePageTitle(page, "Field notes, sent again");
    await expect(page.getByText("Connection restored")).toBeVisible();
    await expect(chip(page)).toHaveCount(0);
  });
});

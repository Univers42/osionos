/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   friends.spec.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #173: the friends system end to end against a stubbed bridge (PLAYWRIGHT_BRIDGE_STUB=1).
// The bridge's own rules (who may accept, a request twice, a blocked peer) are proven by
// tests/bridge/bridge-social-connections*.test.mjs; this drives the screens that call it:
// Connect on a profile, Accept in the request inbox, the list and Remove in Settings → Contacts.

import { expect, test } from "@playwright/test";

import { BOB_PUBLIC, OTHER, profileBody } from "../support/profilePageMocks.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";
import { openSettings, region } from "../support/settingsHelpers.mjs";

const peer = (id, name) => ({ id, name, avatar: null, headline: null, online: false });
const edge = (id, who, status, direction, introMessage = "") => ({
  id, peer: who, status, direction, introMessage, source: "direct", createdAt: "2026-10-30T09:00:00.000Z",
});

const ADA = peer("user-ada", "Ada Lovelace");
const GRACE = peer("user-grace", "Grace Hopper");

/** The bridge's connection table, the writes it took, and Bob's profile for the Connect flow. */
async function stubFriends(page) {
  const state = {
    edges: [edge("edge-ada", ADA, "accepted", "outgoing", "Met at the analytical engine meetup"),
      edge("edge-grace", GRACE, "pending", "incoming", "Hi! We worked on COBOL together.")],
    writes: [],
  };
  await stubBridge(page, (url, request) => {
    const method = request.method();
    const [, edgeId] = url.pathname.match(/^\/api\/connections\/([^/]+)$/) ?? [];
    if (url.pathname === `/api/profile/${OTHER.id}`) return { json: profileBody(OTHER.id, OTHER.username, "Bob Jones") };
    if (url.pathname === `/api/users/${OTHER.username}`) return { json: BOB_PUBLIC };
    if (url.pathname === "/api/directory/search") return { json: { people: [{ ...peer(OTHER.id, "Bob Jones"), username: OTHER.username }] } };
    if (url.pathname === "/api/social/blocks") return { json: { blocks: [] } };
    if (url.pathname === "/api/connections" && method === "GET") return { json: { connections: state.edges } };
    if (url.pathname === "/api/connections" && method === "POST") {
      const body = request.postDataJSON();
      state.writes.push({ method, body });
      const created = edge("edge-bob", peer(body.addresseeId, "Bob Jones"), "pending", "outgoing", body.introMessage ?? "");
      state.edges.push(created);
      return { status: 201, json: { connection: created } };
    }
    if (edgeId && method === "PATCH") {
      const body = request.postDataJSON();
      state.writes.push({ method, edgeId, body });
      const found = state.edges.find((item) => item.id === edgeId);
      if (body.action === "accept") found.status = "accepted";
      return { json: { connection: found } };
    }
    if (edgeId && method === "DELETE") {
      state.writes.push({ method, edgeId });
      state.edges = state.edges.filter((item) => item.id !== edgeId);
      return { status: 204 };
    }
    return undefined;
  });
  return state;
}

async function signIn(page, baseURL) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  // Seed once the boot sign-in has written its session, or it overwrites the token.
  await page.getByRole("button", { name: "Settings", exact: true }).first().waitFor();
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
}

const connections = (page) => region(page).locator('[data-settings-anchor="connections"]');
const removeButtons = (page) => connections(page).getByRole("button", { name: "Remove", exact: true });

async function openContacts(page, baseURL) {
  await signIn(page, baseURL);
  await openSettings(page, "Contacts");
  await expect(connections(page).getByText(ADA.name, { exact: true })).toBeVisible();
}

test.describe("friends (bridge stub)", () => {
  test("the friends list shows each friend with the note they connected with", async ({ page, baseURL }) => {
    await stubFriends(page);
    await openContacts(page, baseURL);
    await expect(connections(page).getByText("Met at the analytical engine meetup")).toBeVisible();
    await expect(removeButtons(page)).toHaveCount(1);
  });

  test("Remove asks first, then drops the friend at the bridge", async ({ page, baseURL }) => {
    const bridge = await stubFriends(page);
    await openContacts(page, baseURL);
    await removeButtons(page).click();
    const dialog = page.getByRole("dialog", { name: `Remove ${ADA.name}?` });
    await expect(dialog).toBeVisible();
    expect(bridge.writes).toEqual([]);
    await dialog.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(connections(page).getByText("No connections yet")).toBeVisible();
    await expect.poll(() => bridge.writes).toEqual([{ method: "DELETE", edgeId: "edge-ada" }]);
  });

  test("accepting a request makes the person a friend", async ({ page, baseURL }) => {
    const bridge = await stubFriends(page);
    await openContacts(page, baseURL);
    const request = connections(page).getByRole("listitem").filter({ hasText: GRACE.name });
    await expect(request).toContainText("We worked on COBOL together.");
    await request.getByRole("button", { name: "Accept" }).click();
    await expect(connections(page).getByText("No incoming requests.")).toBeVisible();
    await expect(removeButtons(page)).toHaveCount(2);
    await expect(connections(page).getByText(GRACE.name, { exact: true })).toBeVisible();
    expect(bridge.writes).toEqual([{ method: "PATCH", edgeId: "edge-grace", body: { action: "accept" } }]);
  });

  test("Connect on someone's profile sends a friend request with a note", async ({ page, baseURL }) => {
    const bridge = await stubFriends(page);
    await signIn(page, baseURL);
    const box = page.getByRole("combobox", { name: "Search pages or run a command" });
    await box.click();
    await box.fill("user:Bob");
    await page.getByRole("option").filter({ hasText: "Bob Jones" }).first().click();
    await expect(page.getByRole("heading", { name: "Bob Jones", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Connect", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Connect with Bob Jones" });
    await dialog.getByPlaceholder("Hi! I'd like to connect…").fill("Loved your talk on type design.");
    await dialog.getByRole("button", { name: "Send request" }).click();

    await expect(page.getByRole("button", { name: "Requested" })).toBeVisible();
    expect(bridge.writes).toEqual([{ method: "POST", body: { addresseeId: OTHER.id, introMessage: "Loved your talk on type design." } }]);
  });
});

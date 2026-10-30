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
// #178: each friend in that list shows whether they are online, not only on hover.

import { expect, test } from "@playwright/test";

import { OTHER, answerProfileReads, heading, openProfileFromPalette } from "../support/profilePageMocks.mjs";
import { openSignedIn, stubBridge } from "../support/bridgeStub.mjs";
import { openSettings, region } from "../support/settingsHelpers.mjs";

const peer = (id, name) => ({ id, name, avatar: null, headline: null, online: false });
const edge = (id, who, status, direction, introMessage = "") => ({
  id, peer: who, status, direction, introMessage, source: "direct", createdAt: "2026-10-30T09:00:00.000Z",
});

const ADA = { ...peer("user-ada", "Ada Lovelace"), online: true };
const ALAN = peer("user-alan", "Alan Turing");
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
    const profile = answerProfileReads(url);
    if (profile) return profile;
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

const connections = (page) => region(page).locator('[data-settings-anchor="connections"]');
/** The presence badge in the innermost block holding both the friend's name and a badge: their own row. */
const presenceOf = (page, name) => connections(page).locator("div").filter({ hasText: name })
  .filter({ has: page.locator("[data-presence]") }).last().locator("[data-presence]");
const removeButtons = (page) => connections(page).getByRole("button", { name: "Remove", exact: true });

async function openContacts(page, baseURL) {
  await openSignedIn(page, baseURL);
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

  test("each friend in the list shows whether they are online", async ({ page, baseURL }) => {
    const bridge = await stubFriends(page);
    bridge.edges.push(edge("edge-alan", ALAN, "accepted", "incoming"));
    await openContacts(page, baseURL);
    await expect(presenceOf(page, ADA.name)).toHaveText("Online");
    await expect(presenceOf(page, ALAN.name)).toHaveText("Offline");
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
    await openSignedIn(page, baseURL);
    await openProfileFromPalette(page, "Bob");
    await expect(heading(page, "Bob Jones")).toBeVisible();

    await page.getByRole("button", { name: "Connect", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Connect with Bob Jones" });
    await dialog.getByPlaceholder("Hi! I'd like to connect…").fill("Loved your talk on type design.");
    await dialog.getByRole("button", { name: "Send request" }).click();

    await expect(page.getByRole("button", { name: "Requested" })).toBeVisible();
    expect(bridge.writes).toEqual([{ method: "POST", body: { addresseeId: OTHER.id, introMessage: "Loved your talk on type design." } }]);
  });
});

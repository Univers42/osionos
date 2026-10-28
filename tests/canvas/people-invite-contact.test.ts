/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   people-invite-contact.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// F5, the contactsSource + peopleActions halves: a contact row carries its edge `source`
// (manual vs colleague) in a hidden property, and the invite posts to the collaboration
// route through the settings transport — the bridge's machine code (not_connected,
// already_member…) must reach the caller as error.code, never be parsed out of the text.

import assert from "node:assert/strict";
import test from "node:test";
import "./support/user-store-env.ts";
import { withBridge } from "./support/stub-bridge.ts";

const { useUserStore } = await import("../../src/features/auth/model/useUserStore.ts");
const { buildContactsState, CONTACT_SOURCE } = await import("../../src/features/settings/people/contactsSource.ts");
const { inviteContact } = await import("../../src/features/settings/people/peopleActions.ts");

// Same fake bridge session as the workspace-lifecycle canvas tests: an osionos_v1 token
// with a future exp, so trySettingsPost sees a page jwt and actually sends.
const token = `osionos_v1.${Buffer.from(JSON.stringify({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.sig`;

function signIn() {
  useUserStore.setState({
    sessions: { u1: { userId: "u1", accessToken: token, refreshToken: "", privateWorkspaces: [], sharedWorkspaces: [] } as never },
    activeUserId: "u1", activeWorkspaceByUser: { u1: "w1" }, error: null,
  });
}

function edge(id: string, source?: "manual" | "colleague") {
  return {
    id,
    peer: { id: `peer-${id}`, name: `Peer ${id}`, avatar: null, headline: null, online: false },
    status: "accepted",
    direction: "outgoing",
    introMessage: null,
    ...(source ? { source } : {}),
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

test("contactsSource keeps the edge source, defaulting a missing one to manual", async () => {
  const connections = [edge("e-manual", "manual"), edge("e-colleague", "colleague"), edge("e-legacy")];
  let state: Awaited<ReturnType<typeof buildContactsState>> | undefined;
  const calls = await withBridge(() => ({ body: { ok: true, connections } }), async () => {
    state = await buildContactsState();
  });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname + new URL(calls[0].url).search, "/api/connections?status=accepted");
  assert.equal(state?.pages["e-manual"].properties[CONTACT_SOURCE], "manual");
  assert.equal(state?.pages["e-colleague"].properties[CONTACT_SOURCE], "colleague");
  assert.equal(state?.pages["e-legacy"].properties[CONTACT_SOURCE], "manual");
  // Hidden but declared: the schema knows the property, no view shows it.
  const database = Object.values(state.databases)[0];
  assert.ok(database.properties[CONTACT_SOURCE]);
  for (const view of Object.values(state.views)) {
    assert.ok(!view.visibleProperties.includes(CONTACT_SOURCE), `${view.id} must not show the source`);
  }
});

test("inviteContact posts {userId, role} to the collaboration route and re-hydrates the invites store", async () => {
  signIn();
  const acceptUrl = "https://app.test/?invite=tok";
  let result: { acceptUrl: string | null } | undefined;
  const calls = await withBridge((call) => (
    call.method === "POST" ? { body: { ok: true, acceptUrl } } : { body: { ok: true } }
  ), async () => {
    result = await inviteContact("w1", "u2", "member");
    // The re-hydrate leaves while the fetch stub is still installed.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.deepEqual(result, { acceptUrl });
  const invite = calls.find((call) => call.method === "POST");
  assert.equal(new URL(invite?.url ?? "").pathname, "/api/collaboration/w1/invite");
  assert.deepEqual(invite?.body, { userId: "u2", role: "member" });
  assert.ok(
    calls.some((call) => call.method === "GET" && new URL(call.url).pathname === "/api/workspaces/w1/invites"),
    "a successful invite re-reads the workspace invites",
  );
});

test("inviteContact surfaces the bridge message and its code, and does not re-hydrate", async () => {
  signIn();
  let failure: Error & { code?: string } | undefined;
  const calls = await withBridge(() => ({
    status: 409,
    body: { ok: false, code: "not_connected", message: "You can only invite people you are connected with." },
  }), async () => {
    await inviteContact("w1", "u2", "member").catch((error: Error & { code?: string }) => { failure = error; });
  });
  assert.ok(failure instanceof Error);
  assert.equal(failure.message, "You can only invite people you are connected with.");
  assert.equal(failure.code, "not_connected");
  assert.equal(calls.length, 1, "the refused invite is the only call");
});

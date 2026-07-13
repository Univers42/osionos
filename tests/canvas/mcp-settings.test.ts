/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mcp-settings.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The MCP feature has no real external OAuth to test against, so its behaviour
// IS the pure connect/disconnect/restrict logic. These tests exercise that
// matrix deterministically — the "make sure they work" gate.

import assert from "node:assert/strict";
import test from "node:test";

import type { McpConnection, McpSettings } from "../../src/store/settings/types.ts";
import { addConnection, canConnectApp, connectedAppIds, removeConnection } from "../../src/store/settings/mcpPolicy.ts";

function makeSettings(partial: Partial<McpSettings> = {}): McpSettings {
  return {
    workspaceId: "ws",
    connected: true,
    allowedTools: ["status", "search"],
    developerMode: false,
    restrictPolicy: "all",
    approvedApps: [],
    connections: [],
    updatedAt: "2026-07-12T00:00:00.000Z",
    ...partial,
  };
}

const alice = { id: "u-alice", name: "Alice" };
const bob = { id: "u-bob", name: "Bob" };
const AT = "2026-07-12T00:00:00.000Z";

test("canConnectApp: master switch gates everything", () => {
  assert.equal(canConnectApp(makeSettings({ connected: false }), "claude"), false);
  assert.equal(canConnectApp(makeSettings({ connected: true }), "claude"), true);
});

test("canConnectApp: restrict policy 'none' blocks all apps", () => {
  assert.equal(canConnectApp(makeSettings({ restrictPolicy: "none" }), "claude"), false);
  assert.equal(canConnectApp(makeSettings({ restrictPolicy: "none" }), "github"), false);
});

test("canConnectApp: 'approved' allows only allowlisted apps", () => {
  const settings = makeSettings({ restrictPolicy: "approved", approvedApps: ["claude"] });
  assert.equal(canConnectApp(settings, "claude"), true);
  assert.equal(canConnectApp(settings, "chatgpt"), false);
});

test("addConnection: adds a link and is idempotent per member", () => {
  const c0: McpConnection[] = [];
  const c1 = addConnection(c0, "claude", alice, AT);
  assert.equal(c1.length, 1);
  assert.deepEqual(c1[0], { appId: "claude", memberId: "u-alice", memberName: "Alice", connectedAt: AT });
  // Same member + app again → SAME reference (no duplicate, no churn).
  const c2 = addConnection(c1, "claude", alice, AT);
  assert.equal(c2, c1);
  // A different member connecting the same app is a new link.
  const c3 = addConnection(c1, "claude", bob, AT);
  assert.equal(c3.length, 2);
});

test("removeConnection: per-member vs disconnect-for-everyone", () => {
  const connections = [
    { appId: "claude", memberId: "u-alice", memberName: "Alice", connectedAt: AT },
    { appId: "claude", memberId: "u-bob", memberName: "Bob", connectedAt: AT },
    { appId: "github", memberId: "u-alice", memberName: "Alice", connectedAt: AT },
  ];
  // Only Alice's Claude link goes; Bob keeps his.
  const perMember = removeConnection(connections, "claude", "u-alice");
  assert.deepEqual(perMember.map((c) => `${c.appId}:${c.memberId}`), ["claude:u-bob", "github:u-alice"]);
  // Admin disconnect of an app removes it for everyone.
  const everyone = removeConnection(connections, "claude");
  assert.deepEqual(everyone.map((c) => `${c.appId}:${c.memberId}`), ["github:u-alice"]);
});

test("connectedAppIds: distinct app count for the Manage 'N connected' badge", () => {
  const connections = [
    { appId: "claude", memberId: "u-alice", memberName: "Alice", connectedAt: AT },
    { appId: "claude", memberId: "u-bob", memberName: "Bob", connectedAt: AT },
    { appId: "github", memberId: "u-alice", memberName: "Alice", connectedAt: AT },
  ];
  assert.deepEqual(connectedAppIds(connections).sort(), ["claude", "github"]);
});

test("end-to-end policy flow: connect, then restrict, then disconnect-all", () => {
  // Anyone can connect → Alice connects Claude and GitHub.
  let settings = makeSettings();
  settings = { ...settings, connections: addConnection(settings.connections, "claude", alice, AT) };
  settings = { ...settings, connections: addConnection(settings.connections, "github", alice, AT) };
  assert.equal(connectedAppIds(settings.connections).length, 2);

  // Admin restricts to approved-only with just Claude approved: new GitHub
  // connects are refused, but existing links are untouched until disconnected.
  settings = { ...settings, restrictPolicy: "approved", approvedApps: ["claude"] };
  assert.equal(canConnectApp(settings, "github"), false);
  assert.equal(canConnectApp(settings, "claude"), true);

  // "Disconnect all users" clears every link.
  settings = { ...settings, connections: [] };
  assert.equal(connectedAppIds(settings.connections).length, 0);
});

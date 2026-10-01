/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mcp-policy.test.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/01 17:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/01 17:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Unit tests for the pure MCP connection/restrict policy functions.
// These are side-effect-free array+predicate operations — no store, no network.

import assert from "node:assert/strict";
import test from "node:test";

import {
  canConnectApp,
  addConnection,
  removeConnection,
  connectedAppIds,
} from "../../src/store/settings/mcpPolicy.ts";

import type { McpConnection, McpSettings } from "../../src/store/settings/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal McpSettings factory — only the fields the policy functions read. */
function mkSettings(overrides: Partial<McpSettings> = {}): McpSettings {
  return {
    workspaceId: "ws-1",
    connected: true,
    allowedTools: [],
    developerMode: false,
    restrictPolicy: "all",
    approvedApps: [],
    connections: [],
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function mkConn(appId: string, memberId: string, memberName = "Test"): McpConnection {
  return { appId, memberId, memberName, connectedAt: "2026-01-01T00:00:00Z" };
}

// ---------------------------------------------------------------------------
// canConnectApp
// ---------------------------------------------------------------------------

test("canConnectApp: returns false when connected=false", () => {
  assert.equal(canConnectApp(mkSettings({ connected: false }), "app-1"), false);
});

test("canConnectApp: returns false when restrictPolicy='none'", () => {
  assert.equal(canConnectApp(mkSettings({ restrictPolicy: "none" }), "app-1"), false);
});

test("canConnectApp: returns true when restrictPolicy='all' and connected", () => {
  assert.equal(canConnectApp(mkSettings({ restrictPolicy: "all" }), "app-1"), true);
});

test("canConnectApp: returns true when restrictPolicy='approved' and appId in approvedApps", () => {
  const settings = mkSettings({ restrictPolicy: "approved", approvedApps: ["app-1", "app-2"] });
  assert.equal(canConnectApp(settings, "app-1"), true);
});

test("canConnectApp: returns false when restrictPolicy='approved' and appId NOT in approvedApps", () => {
  const settings = mkSettings({ restrictPolicy: "approved", approvedApps: ["app-2"] });
  assert.equal(canConnectApp(settings, "app-1"), false);
});

test("canConnectApp: returns false when restrictPolicy='approved' and approvedApps is undefined", () => {
  // Edge case: approvedApps might be undefined if settings were partially loaded.
  const settings = mkSettings({ restrictPolicy: "approved", approvedApps: undefined as unknown as string[] });
  assert.equal(canConnectApp(settings, "app-1"), false);
});

test("canConnectApp: connected=false overrides restrictPolicy='all'", () => {
  assert.equal(canConnectApp(mkSettings({ connected: false, restrictPolicy: "all" }), "app-1"), false);
});

// ---------------------------------------------------------------------------
// addConnection
// ---------------------------------------------------------------------------

test("addConnection: adds a new connection to empty array", () => {
  const result = addConnection([], "app-1", { id: "m1", name: "Alice" }, "2026-06-01T00:00:00Z");
  assert.equal(result.length, 1);
  assert.equal(result[0].appId, "app-1");
  assert.equal(result[0].memberId, "m1");
  assert.equal(result[0].memberName, "Alice");
  assert.equal(result[0].connectedAt, "2026-06-01T00:00:00Z");
});

test("addConnection: appends to existing connections", () => {
  const existing = [mkConn("app-1", "m1")];
  const result = addConnection(existing, "app-2", { id: "m1", name: "Alice" }, "2026-06-01T00:00:00Z");
  assert.equal(result.length, 2);
  assert.equal(result[1].appId, "app-2");
});

test("addConnection: returns same array reference when duplicate exists (idempotent)", () => {
  const existing = [mkConn("app-1", "m1")];
  const result = addConnection(existing, "app-1", { id: "m1", name: "Alice" }, "2026-07-01T00:00:00Z");
  assert.equal(result, existing); // identity check — same reference
  assert.equal(result.length, 1);
});

test("addConnection: allows same app by different members", () => {
  const existing = [mkConn("app-1", "m1")];
  const result = addConnection(existing, "app-1", { id: "m2", name: "Bob" }, "2026-06-01T00:00:00Z");
  assert.equal(result.length, 2);
  assert.equal(result[1].memberId, "m2");
});

// ---------------------------------------------------------------------------
// removeConnection
// ---------------------------------------------------------------------------

test("removeConnection: removes all connections for an appId (no memberId)", () => {
  const conns = [mkConn("app-1", "m1"), mkConn("app-1", "m2"), mkConn("app-2", "m1")];
  const result = removeConnection(conns, "app-1");
  assert.equal(result.length, 1);
  assert.equal(result[0].appId, "app-2");
});

test("removeConnection: removes only the specified member's connection", () => {
  const conns = [mkConn("app-1", "m1"), mkConn("app-1", "m2")];
  const result = removeConnection(conns, "app-1", "m1");
  assert.equal(result.length, 1);
  assert.equal(result[0].memberId, "m2");
});

test("removeConnection: returns empty array when removing last connection", () => {
  const conns = [mkConn("app-1", "m1")];
  const result = removeConnection(conns, "app-1");
  assert.deepEqual(result, []);
});

test("removeConnection: returns unchanged-content array when appId not found", () => {
  const conns = [mkConn("app-1", "m1")];
  const result = removeConnection(conns, "app-999");
  assert.deepEqual(result, conns);
  assert.equal(result.length, 1);
});

// ---------------------------------------------------------------------------
// connectedAppIds
// ---------------------------------------------------------------------------

test("connectedAppIds: returns empty array for empty connections", () => {
  assert.deepEqual(connectedAppIds([]), []);
});

test("connectedAppIds: returns unique app IDs (deduplicates)", () => {
  const conns = [mkConn("app-1", "m1"), mkConn("app-1", "m2"), mkConn("app-2", "m1")];
  const ids = connectedAppIds(conns);
  assert.deepEqual(ids, ["app-1", "app-2"]);
});

test("connectedAppIds: preserves insertion order", () => {
  const conns = [mkConn("app-3", "m1"), mkConn("app-1", "m1"), mkConn("app-2", "m1")];
  assert.deepEqual(connectedAppIds(conns), ["app-3", "app-1", "app-2"]);
});

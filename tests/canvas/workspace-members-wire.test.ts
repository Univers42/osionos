/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspace-members-wire.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 10:00:00 by dlesieur         #+#    #+#             */
/*   Updated: 2026/10/21 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The members wire adapter. The bridge's `{ok, members}` body went into the
 * store as is and every `.filter` on it threw at sign-in (public build,
 * 2026-10-21); a persisted copy of that object has to be dropped on load too.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { sanitizePersistedMembers, workspaceMemberFromWire, workspaceMembersFromWire } from "../../src/store/settings/workspaceMembersWire.ts";

test("the bridge body becomes members with UI roles", () => {
  const members = workspaceMembersFromWire("ws-1", {
    ok: true,
    members: [
      { userId: "u-owner", name: "Helena", avatar: null, role: "owner" },
      { userId: "u-ed", name: "Reed", avatar: null, role: "editor" },
      { userId: "u-view", name: "Sam", avatar: null, role: "viewer" },
      { userId: "u-adm", name: "Ada", avatar: null, role: "admin" },
    ],
  });
  assert.deepEqual(members?.map((m) => [m.userId, m.role, m.workspaceId]), [
    ["u-owner", "owner", "ws-1"], ["u-ed", "member", "ws-1"], ["u-view", "guest", "ws-1"], ["u-adm", "admin", "ws-1"],
  ]);
});

test("a legacy array body is still read", () => {
  assert.deepEqual(workspaceMembersFromWire("ws-1", [{ userId: "u-1", role: "member" }])?.map((m) => m.role), ["member"]);
});

test("malformed rows are dropped and a body without members is null", () => {
  assert.deepEqual(workspaceMembersFromWire("ws-1", { members: [null, 3, { name: "x" }, { userId: "" }, { userId: "u", role: "root" }] })?.map((m) => [m.userId, m.role]), [["u", "guest"]]);
  assert.equal(workspaceMembersFromWire("ws-1", { ok: false }), null);
  assert.equal(workspaceMembersFromWire("ws-1", null), null);
});

test("a persisted object where an array belongs is dropped on load", () => {
  const clean = sanitizePersistedMembers({ "ws-1": { ok: true, members: [] }, "ws-2": [{ userId: "u-1" }, "junk"] });
  assert.deepEqual(Object.keys(clean), ["ws-2"]);
  assert.equal(clean["ws-2"].length, 1);
  assert.deepEqual(sanitizePersistedMembers(undefined), {});
});

test("a PATCH answer ({ok, member}) maps to one member with the UI role", () => {
  assert.equal(workspaceMemberFromWire("ws-1", { ok: true, member: { userId: "u-1", role: "editor" } })?.role, "member");
  assert.equal(workspaceMemberFromWire("ws-1", { ok: true })?.userId, undefined);
});

test("W1: the bridge's name is kept trimmed and capped, anything else leaves it unset", () => {
  const members = workspaceMembersFromWire("ws-1", {
    ok: true,
    members: [
      { userId: "u1", name: " Ada ", role: "editor" },
      { userId: "u2", name: "", role: "viewer" },
      { userId: "u3", name: 42 },
      { userId: "u4", name: "x".repeat(300) },
    ],
  });
  assert.deepEqual(members?.map((m) => m.name), ["Ada", undefined, undefined, "x".repeat(120)]);
});

test("W2: persisted rows keep a string name and lose a numeric one without being dropped", () => {
  const clean = sanitizePersistedMembers({ "ws-1": [{ userId: "u1", name: "Ada" }, { userId: "u2", name: 7 }, { userId: "u3" }] });
  assert.deepEqual(clean["ws-1"].map((m) => [m.userId, m.name]), [["u1", "Ada"], ["u2", undefined], ["u3", undefined]]);
});

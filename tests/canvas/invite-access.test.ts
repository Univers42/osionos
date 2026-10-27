/**
 * Invite entry points show only for a workspace owner or admin: the bridge answers 403 to anyone else.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { canInviteMembers } from "../../src/features/settings/people/inviteAccess.ts";

const ROSTER = [
  { userId: "owner-1", role: "owner" },
  { userId: "admin-1", role: "admin" },
  { userId: "member-1", role: "member" },
  { userId: "guest-1", role: "guest" },
] as const;

test("owner and admin may invite", () => {
  assert.equal(canInviteMembers(ROSTER, "owner-1"), true);
  assert.equal(canInviteMembers(ROSTER, "admin-1"), true);
});

test("member, guest, unknown user and an unloaded roster may not", () => {
  assert.equal(canInviteMembers(ROSTER, "member-1"), false);
  assert.equal(canInviteMembers(ROSTER, "guest-1"), false);
  assert.equal(canInviteMembers(ROSTER, "stranger"), false);
  assert.equal(canInviteMembers(undefined, "owner-1"), false);
});

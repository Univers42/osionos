/* ************************************************************************** */
/*  session-select.test.ts — cross-account isolation rule for init activation */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { selectActivatedSessions } from "../../src/features/auth/model/sessionSelect.ts";

type Rec = { session: { userId: string }; tag?: string };

const rec = (userId: string, tag?: string): Rec => ({ session: { userId }, tag });

const A = rec("user-a", "dev.pro.photo");        // prior user on this browser
const B = rec("user-b", "higueraslp");           // a different person logging in fresh

test("fresh handoff REPLACES — a new sign-in never inherits the prior user's session", () => {
  const persisted = { "user-a": A };               // dev.pro.photo left in localStorage
  const records = selectActivatedSessions("user-b", B, persisted, /* adding */ false);
  assert.deepEqual(records.map((r) => r.session.userId), ["user-b"]);
  // The prior user must be GONE (this is the leak fix).
  assert.ok(!records.some((r) => r.session.userId === "user-a"));
});

test("deliberate 'Add another account' MERGES — both accounts kept", () => {
  const persisted = { "user-a": A };
  const records = selectActivatedSessions("user-b", B, persisted, /* adding */ true);
  assert.deepEqual(records.map((r) => r.session.userId).sort(), ["user-a", "user-b"]);
});

test("plain refresh (no handoff) restores EVERY persisted account", () => {
  const persisted = { "user-a": A, "user-b": B };
  const records = selectActivatedSessions(null, null, persisted, false);
  assert.deepEqual(records.map((r) => r.session.userId).sort(), ["user-a", "user-b"]);
});

test("first-ever fresh login (empty persisted) yields exactly that one account", () => {
  const records = selectActivatedSessions("user-b", B, {}, false);
  assert.deepEqual(records.map((r) => r.session.userId), ["user-b"]);
});

test("re-login as an existing account REPLACES, never duplicates", () => {
  const persisted = { "user-a": A };
  const records = selectActivatedSessions("user-a", rec("user-a", "fresh"), persisted, false);
  assert.equal(records.length, 1);
  assert.equal(records[0].session.userId, "user-a");
  assert.equal(records[0].tag, "fresh"); // the new record wins
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   share-page-model.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Share dialog, for a page, edits exactly what the bridge enforces: the page's
// collaborators (viewer | editor) and its visibility. It refuses, with a message, what the
// bridge would refuse, and never reports a change the bridge ignored as saved.

import assert from "node:assert/strict";
import test from "node:test";

import {
  PAGE_SHARE_LEVELS,
  assertSharingApplied,
  entriesFromPageSharing,
  entriesFromPageAccess,
  membersToPeople,
  sharingPatch,
  sharingWith,
  sharingWithout,
  type PageSharing,
} from "../../src/features/share/pageShareModel.ts";
import type { ShareEntry, SharePerson } from "../../src/features/share/types.ts";

const ALICE = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const CAROL = "cccccccc-3333-4333-8333-cccccccccccc";
const members: SharePerson[] = membersToPeople([
  { userId: ALICE, name: "Alice", role: "owner" },
  { userId: BOB, name: "Bob", role: "viewer" },
]);
const carol: SharePerson = { id: CAROL, email: "carol@example.com", name: "Carol", role: "analyst" };
const privatePage: PageSharing = { visibility: "private", collaborators: [] };

test("offers only the levels a page enforces", () => {
  assert.deepEqual([...PAGE_SHARE_LEVELS], ["can_view", "can_edit"]);
});

test("maps workspace members to people, keyed by user id", () => {
  assert.deepEqual(members.map((person) => [person.id, person.name, person.wsRole]), [[ALICE, "Alice", "owner"], [BOB, "Bob", "viewer"]]);
});

test("sharing with a member adds a viewer or an editor collaborator", () => {
  const bob = members[1];
  assert.deepEqual(sharingWith(privatePage, { type: "user", person: bob }, "can_view", members).collaborators, [{ userId: BOB, role: "viewer" }]);
  assert.deepEqual(sharingWith(privatePage, { type: "user", person: bob }, "can_edit", members).collaborators, [{ userId: BOB, role: "editor" }]);
});

test("changing a member's level replaces their entry instead of adding a second one", () => {
  const shared: PageSharing = { visibility: "private", collaborators: [{ userId: BOB.toUpperCase(), role: "viewer" }, { userId: ALICE, role: "editor" }] };
  const next = sharingWith(shared, { type: "user", person: members[1] }, "can_edit", members);
  assert.deepEqual(next.collaborators, [{ userId: BOB, role: "editor" }, { userId: ALICE, role: "editor" }]);
});

test("refuses someone who is not a member of the workspace, naming them", () => {
  assert.throws(
    () => sharingWith(privatePage, { type: "user", person: carol }, "can_view", members),
    /Carol is not a member of this workspace/,
  );
});

test("'no access' for a person removes them", () => {
  const shared: PageSharing = { visibility: "private", collaborators: [{ userId: BOB, role: "viewer" }] };
  assert.deepEqual(sharingWith(shared, { type: "user", person: members[1] }, "no_access", members).collaborators, []);
});

test("the whole workspace is visibility 'shared', and removing it makes the page private", () => {
  const shared = sharingWith(privatePage, { type: "workspace" }, "can_view", members);
  assert.equal(shared.visibility, "shared");
  assert.equal(sharingWithout(shared, { type: "workspace" }).visibility, "private");
});

test("revoking a person removes exactly their collaborator entry", () => {
  const shared: PageSharing = { visibility: "shared", collaborators: [{ userId: BOB, role: "viewer" }, { userId: ALICE, role: "editor" }] };
  assert.deepEqual(sharingWithout(shared, { type: "user", person: members[1] }), { visibility: "shared", collaborators: [{ userId: ALICE, role: "editor" }] });
});

test("refuses role and public targets with a message, since a page enforces neither", () => {
  assert.throws(() => sharingWith(privatePage, { type: "role", role: "analyst" }, "can_view", members), /people in its workspace/);
  assert.throws(() => sharingWith(privatePage, { type: "public" }, "can_view", members), /Publish/);
  assert.throws(() => sharingWithout({ visibility: "public", collaborators: [] }, { type: "public" }), /Publish/);
});

test("lists collaborators and workspace access as the page stores them", () => {
  const sharing: PageSharing = { visibility: "shared", collaborators: [{ userId: BOB, role: "editor" }, { userId: CAROL, role: "viewer" }] };
  const entries = entriesFromPageSharing(sharing, members);
  assert.deepEqual(entries.map((entry) => [entry.key, entry.level]), [[`user:${BOB}`, "can_edit"], [`user:${CAROL}`, "can_view"], ["workspace", "can_view"]]);
  const stranger = entries[1].target;
  assert.ok(stranger.type === "user" && /not a member/i.test(stranger.person.email), "a non-member collaborator is shown as one who cannot open the page");
});

test("lists a published page as public", () => {
  assert.deepEqual(entriesFromPageSharing({ visibility: "public", collaborators: [] }, members).map((entry) => entry.key), ["public"]);
});

test("sends only the keys that changed", () => {
  const next: PageSharing = { visibility: "private", collaborators: [{ userId: BOB, role: "viewer" }] };
  assert.deepEqual(sharingPatch(privatePage, next), { collaborators: next.collaborators });
  assert.deepEqual(sharingPatch(privatePage, { ...privatePage, visibility: "shared" }), { visibility: "shared" });
});

test("treats sharing keys the bridge ignored as a refusal, not a save", () => {
  assert.doesNotThrow(() => assertSharingApplied({ ok: true, updatedAt: "2026-10-15T00:00:00.000Z" }));
  assert.doesNotThrow(() => assertSharingApplied(null));
  assert.throws(() => assertSharingApplied({ ok: true, ignored: ["collaborators"] }), /Only the page owner/);
  assert.throws(() => assertSharingApplied({ ok: true, ignored: ["visibility"] }), /Only the page owner/);
});

// Both branches' persisted grants may coexist after merging.
test("explicit rules override matching page grants while preserving teams and other collaborators", () => {
  const sharing: PageSharing = { visibility: "shared", collaborators: [{ userId: BOB.toUpperCase(), role: "editor" }, { userId: ALICE, role: "viewer" }] };
  const rules: ShareEntry[] = [
    { key: `user:${BOB}`, target: { type: "user", person: members[1] }, level: "no_access", sourceId: "deny-bob" },
    { key: "team:design", target: { type: "team", team: { id: "design", name: "Design", memberCount: 3 } }, level: "can_edit", sourceId: "team-design" },
  ];
  const entries = entriesFromPageAccess(sharing, members, rules);
  assert.deepEqual(entries.map((entry) => [entry.key, entry.level, entry.sourceId]), [
    [`user:${ALICE}`, "can_view", undefined], ["workspace", "can_view", undefined],
    [`user:${BOB}`, "no_access", "deny-bob"], ["team:design", "can_edit", "team-design"],
  ]);
  assert.deepEqual(sharing.collaborators[0], { userId: BOB.toUpperCase(), role: "editor" });
});

test("teams use access rules rather than being coerced to individual collaborators", () => {
  const target = { type: "team" as const, team: { id: "design", name: "Design", memberCount: 3 } };
  assert.throws(() => sharingWith(privatePage, target, "can_view", members), /people in its workspace/);
  assert.throws(() => sharingWithout(privatePage, target), /people in its workspace/);
});

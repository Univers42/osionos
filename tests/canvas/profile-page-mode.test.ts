// ADR 0064 PS32/PS34/PS37: which profile a viewer gets. Off → today's profile. On → the
// README page; a visitor of an account with no username or no README keeps today's
// profile (never an empty page); the owner without a README is offered "create", which
// nothing but a click acts on.

import assert from "node:assert/strict";
import test from "node:test";

const { profilePageMode } = await import("../../src/widgets/profile-page/model/profilePageMode.ts");

const README = { pageId: "readme-1", blocks: [] };
const profile = (extra: Record<string, unknown> = {}) => ({
  userId: "u1", name: "Ada", avatar: null, lastSeenAt: null, online: false, username: "ada", readme: README, ...extra,
});

test("flag off: everyone gets today's profile, whatever the profile holds", () => {
  for (const isOwner of [true, false]) {
    assert.equal(profilePageMode(profile(), { isOwner, enabled: false }), "today");
    assert.equal(profilePageMode(profile({ readme: null }), { isOwner, enabled: false }), "today");
  }
});

test("flag on, profile not loaded yet: today's profile (its loading state)", () => {
  assert.equal(profilePageMode(null, { isOwner: true, enabled: true }), "today");
});

test("flag on with a README: the page, for the owner and a visitor", () => {
  assert.equal(profilePageMode(profile(), { isOwner: true, enabled: true }), "page");
  assert.equal(profilePageMode(profile(), { isOwner: false, enabled: true }), "page");
  assert.equal(profilePageMode(profile({ readme: { pageId: "r", truncated: true } }), { isOwner: false, enabled: true }), "page");
});

test("PS37: a visitor without a username or without a README gets today's profile", () => {
  assert.equal(profilePageMode(profile({ username: null }), { isOwner: false, enabled: true }), "today");
  assert.equal(profilePageMode(profile({ username: "" }), { isOwner: false, enabled: true }), "today");
  assert.equal(profilePageMode(profile({ readme: null }), { isOwner: false, enabled: true }), "today");
  assert.equal(profilePageMode(profile({ readme: undefined }), { isOwner: false, enabled: true }), "today");
});

test("PS34: the owner without a README is offered creation, never handed a page", () => {
  assert.equal(profilePageMode(profile({ readme: null }), { isOwner: true, enabled: true }), "create");
  assert.equal(profilePageMode(profile({ readme: null, username: null }), { isOwner: true, enabled: true }), "create");
  assert.equal(profilePageMode(profile({ username: null }), { isOwner: true, enabled: true }), "page", "the owner reads their own README without a card");
});

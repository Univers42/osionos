/**
 * F5: an admin sees when a pending invite expires — the Guests table gains an Expires date
 * column right after Status, and a pending invite past its expiry reads as "expired"
 * (accepted and revoked are facts and win). inviteStatus takes `now`, so the mapping is a
 * pure function: no clock to freeze in tests.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { buildGuestsState, inviteStatus } from "../../src/features/settings/people/guestsSource.ts";
import { GUEST } from "../../src/features/settings/people/peopleModel.ts";
import { useWorkspaceInvitesStore } from "../../src/store/settings/index.ts";

const WS = "ws-1";
const CTX = { workspaceId: WS, activeUserId: "u-ada", personas: [], query: "" };
const NOW = Date.parse("2026-10-28T00:00:00Z");

test("the Guests table shows Expires right after Status", async () => {
  const state = await buildGuestsState(CTX);
  assert.deepEqual(Object.values(state.views)[0].visibleProperties, [GUEST.email, GUEST.role, GUEST.status, GUEST.expires, GUEST.since]);
  const expires = Object.values(state.databases)[0].properties[GUEST.expires];
  assert.equal(expires.name, "Expires");
  assert.equal(expires.type, "date");
});

test("inviteStatus answers pending / expired / accepted / revoked", () => {
  const live = { expiresAt: "2026-11-04T00:00:00Z" };
  const past = { expiresAt: "2026-10-27T00:00:00Z" };
  assert.equal(inviteStatus(live, NOW), "pending");
  assert.equal(inviteStatus(past, NOW), "expired");
  // Accepted and revoked win over the expiry of the same row.
  assert.equal(inviteStatus({ ...past, acceptedAt: "2026-10-20T00:00:00Z" }, NOW), "accepted");
  assert.equal(inviteStatus({ ...past, revokedAt: "2026-10-21T00:00:00Z" }, NOW), "revoked");
  assert.equal(inviteStatus({ ...past, acceptedAt: "2026-10-20T00:00:00Z", revokedAt: "2026-10-21T00:00:00Z" }, NOW), "revoked");
});

test("an expired pending invite builds an 'expired' Status cell and keeps its Expires date", async () => {
  useWorkspaceInvitesStore.setState({ data: { [WS]: [{
    _id: "i1", workspaceId: WS, email: "g@example.com", role: "guest", invitedBy: "u-ada",
    expiresAt: "2026-10-01T00:00:00Z", acceptedAt: null, revokedAt: null,
    createdAt: "2026-09-24T00:00:00Z", updatedAt: "2026-09-24T00:00:00Z",
  }] } });
  const state = await buildGuestsState(CTX);
  const page = Object.values(state.pages)[0];
  const database = Object.values(state.databases)[0];
  const statusOption = database.properties[GUEST.status].options?.find((option) => option.id === page.properties[GUEST.status]);
  assert.equal(statusOption?.value, "expired");
  assert.equal(page.properties[GUEST.expires], "2026-10-01T00:00:00Z");
});

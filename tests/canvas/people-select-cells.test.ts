/**
 * The table engine matches a select cell by option id, so the People sources write ids, not raw values.
 * A raw value left every Role / Status cell showing "Empty".
 */

import assert from "node:assert/strict";
import test from "node:test";

import { buildGuestsState } from "../../src/features/settings/people/guestsSource.ts";
import { buildMembersState } from "../../src/features/settings/people/membersSource.ts";
import { GUEST, MEMBER } from "../../src/features/settings/people/peopleModel.ts";
import { useWorkspaceInvitesStore, useWorkspaceMembersStore } from "../../src/store/settings/index.ts";

const WS = "ws-1";
const CTX = { workspaceId: WS, activeUserId: "u-ada", personas: [], query: "" };

type Built = Awaited<ReturnType<typeof buildMembersState>>;
function optionValue(state: Built, propertyId: string, cell: unknown): unknown {
  const database = Object.values(state.databases)[0];
  const property = database.properties[propertyId] as { options?: Array<{ id: string; value: string }> };
  return property.options?.find((option) => option.id === cell)?.value;
}

test("a member's Role cell resolves to its option", async () => {
  useWorkspaceMembersStore.setState({ data: { [WS]: [{ userId: "u-ada", name: "Ada", role: "member", joinedAt: "2026-10-01T00:00:00Z" }] as never } });
  const state = await buildMembersState(CTX);
  const page = Object.values(state.pages)[0];
  assert.equal(optionValue(state, MEMBER.role, page.properties[MEMBER.role]), "member");
});

test("a guest's Role and Status cells resolve to their options", async () => {
  useWorkspaceInvitesStore.setState({ data: { [WS]: [{
    _id: "i1", workspaceId: WS, email: "g@example.com", role: "guest", invitedBy: "u-ada", expiresAt: "2026-11-01T00:00:00Z",
    acceptedAt: null, revokedAt: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
  }] } });
  const state = await buildGuestsState(CTX);
  const page = Object.values(state.pages)[0];
  assert.equal(optionValue(state, GUEST.role, page.properties[GUEST.role]), "guest");
  assert.equal(optionValue(state, GUEST.status, page.properties[GUEST.status]), "pending");
});

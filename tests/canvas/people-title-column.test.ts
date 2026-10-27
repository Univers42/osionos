/**
 * The table engine renders only the view's visibleProperties, so the title column (Name / Email)
 * must be listed first or the People tables show rows with no name.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { buildGuestsState } from "../../src/features/settings/people/guestsSource.ts";
import { buildMembersState } from "../../src/features/settings/people/membersSource.ts";
import { GUEST, MEMBER } from "../../src/features/settings/people/peopleModel.ts";

const CTX = { workspaceId: "ws-1", activeUserId: "u-ada", personas: [], query: "" };

test("the Members table lists the Name column first", async () => {
  const state = await buildMembersState(CTX);
  assert.equal(Object.values(state.views)[0].visibleProperties[0], MEMBER.name);
});

test("the Guests table lists the Email (title) column first", async () => {
  const state = await buildGuestsState(CTX);
  assert.equal(Object.values(state.views)[0].visibleProperties[0], GUEST.email);
});

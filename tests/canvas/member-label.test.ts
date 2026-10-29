/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   member-label.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur         #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** L1 the one naming rule, M1 the Members source using it. */

import assert from "node:assert/strict";
import test from "node:test";

import { memberLabel } from "../../src/features/settings/model/memberLabel.ts";
import { buildMembersState } from "../../src/features/settings/people/membersSource.ts";
import { useWorkspaceMembersStore } from "../../src/store/settings/index.ts";
import { workspaceMembersFromWire } from "../../src/store/settings/workspaceMembersWire.ts";

const names = new Map([["u1", "Persona"]]);

const CASES: Array<[string, string, string | undefined, string]> = [
  ["wire name wins over persona", "u1", "Wire", "Wire"],
  ["wire name equal to the id falls to the persona", "u1", "u1", "Persona"],
  ["empty wire name falls to the persona", "u1", "", "Persona"],
  ["no persona gives the id", "u9", undefined, "u9"],
];

for (const [title, userId, wire, expected] of CASES) {
  test(`L1: ${title}`, () => assert.equal(memberLabel(userId, names, wire), expected));
}

test("M1: a member with a wire name and no persona is titled with that name", async () => {
  const data = workspaceMembersFromWire("ws-1", { ok: true, members: [{ userId: "u-ada", name: "Ada", role: "editor" }, { userId: "u-bare", role: "viewer" }] });
  useWorkspaceMembersStore.setState({ data: { "ws-1": data ?? [] } });
  const state = await buildMembersState({ workspaceId: "ws-1", activeUserId: "x", personas: [], query: "" });
  const titles = JSON.stringify(state);
  assert.ok(titles.includes("Ada"));
  assert.ok(titles.includes("u-bare"));
});

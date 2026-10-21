/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-shared-space-gate.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 10:00:00 by dlesieur         #+#    #+#             */
/*   Updated: 2026/10/21 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The shared-space JOIN gate (`sharedSpaceIdFor`) in isolation. It must admit
 * a joined-by-me space and an OWN space that has someone else inside (the
 * owner belongs in their own roster, Notion-style), and refuse everything
 * else: an owned-but-empty room (pointless TRACK traffic), flag OFF, no
 * active workspace. Plain values in, id or null out — no stores, no React.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { sharedSpaceIdFor } from "../../src/features/collab/model/sharedSpaceGate.ts";

const gate = (overrides: Partial<Parameters<typeof sharedSpaceIdFor>[0]> = {}) =>
  sharedSpaceIdFor({
    flagEnabled: true,
    activeWorkspaceId: "ws-1",
    sharedWorkspaceIds: [],
    ownedBySelf: false,
    otherMemberCount: 0,
    ...overrides,
  });

test("a workspace joined by me resolves to its space id", () => {
  assert.equal(gate({ sharedWorkspaceIds: ["ws-1", "ws-2"] }), "ws-1");
});

test("an owned workspace with at least one other member resolves to its space id", () => {
  assert.equal(gate({ ownedBySelf: true, otherMemberCount: 1 }), "ws-1");
  assert.equal(gate({ ownedBySelf: true, otherMemberCount: 4 }), "ws-1");
});

test("an owned workspace with nobody else inside stays null (no empty-room TRACK)", () => {
  assert.equal(gate({ ownedBySelf: true, otherMemberCount: 0 }), null);
});

test("the flag off gates everything out", () => {
  assert.equal(gate({ flagEnabled: false, sharedWorkspaceIds: ["ws-1"] }), null);
  assert.equal(gate({ flagEnabled: false, ownedBySelf: true, otherMemberCount: 3 }), null);
});

test("no active workspace (null or empty) stays null", () => {
  assert.equal(gate({ activeWorkspaceId: null, sharedWorkspaceIds: ["ws-1"] }), null);
  assert.equal(gate({ activeWorkspaceId: "", sharedWorkspaceIds: ["ws-1"] }), null);
});

test("membership alone is not ownership: a joined-list miss without ownership stays null", () => {
  assert.equal(gate({ ownedBySelf: false, otherMemberCount: 5 }), null);
});

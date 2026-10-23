/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   admin-space-sections.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-4-b: the Admin space shows a caller only the sections their platform role reaches, and
// the rail offers the Admin entry from moderator up. Both are affordances — the bridge is the
// authority — so the tests pin the filter, not any permission.

import assert from "node:assert/strict";
import test from "node:test";

import { RAIL_GROUPS, visibleRailItems } from "../../src/widgets/activity-rail/model/railItems.ts";
import { BUILT_IN_SECTIONS, visibleSections, type AdminSection } from "../../src/widgets/admin-space/model/adminSections.ts";

const ids = (sections: readonly { id: string }[]) => sections.map((section) => section.id);
const workspace = RAIL_GROUPS.find((group) => group.id === "workspace")!;
const apps = RAIL_GROUPS.find((group) => group.id === "apps")!;

test("a moderator sees only the Moderation section", () => {
  assert.deepEqual(ids(visibleSections(BUILT_IN_SECTIONS, "moderator")), ["moderation"]);
});

test("an admin sees every section", () => {
  assert.deepEqual(ids(visibleSections(BUILT_IN_SECTIONS, "admin")), ids(BUILT_IN_SECTIONS));
  assert.ok(ids(BUILT_IN_SECTIONS).includes("templates"));
});

test("a user, a guest and no role see none", () => {
  for (const role of ["user", "guest", null] as const) {
    assert.deepEqual(visibleSections(BUILT_IN_SECTIONS, role), []);
  }
});

test("the filter follows requiredRole, not the section id", () => {
  const load = () => Promise.resolve({ default: () => null });
  const probe = (id: string, requiredRole: AdminSection["requiredRole"]): AdminSection =>
    ({ id, label: id, Icon: BUILT_IN_SECTIONS[0].Icon, requiredRole, load });
  const list = [probe("a", "admin"), probe("b", "moderator"), probe("c", "user")];
  assert.deepEqual(ids(visibleSections(list, "moderator")), ["b", "c"]);
});

test("the rail offers Admin from moderator up and hides it from a user or no role", () => {
  assert.ok(visibleRailItems(workspace, "moderator").some((item) => item.id === "admin"));
  assert.ok(visibleRailItems(workspace, "admin").some((item) => item.id === "admin"));
  assert.ok(!visibleRailItems(workspace, "user").some((item) => item.id === "admin"));
  assert.ok(!visibleRailItems(workspace, null).some((item) => item.id === "admin"));
});

test("the Admin rail item opens a workspace tab of kind admin", () => {
  const item = workspace.items.find((candidate) => candidate.id === "admin");
  assert.equal(item?.requiredRole, "moderator");
  assert.equal(item?.action.kind, "workspaceTab");
  if (item?.action.kind === "workspaceTab") assert.equal(item.action.makeTab().kind, "admin");
});

test("the role filter leaves the isAvailable filter of the apps group alone", () => {
  const withRole = ids(visibleRailItems(apps, "user"));
  const without = ids(visibleRailItems(apps));
  assert.deepEqual(withRole, without);
});

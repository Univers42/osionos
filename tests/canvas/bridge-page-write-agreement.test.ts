/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-write-agreement.test.ts                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The bridge's page WRITE rule (scripts/bridge-api.mjs canWritePageRow) must agree
// with the client's canWritePage on exactly what the client receives — the row after
// pageRowToEntry. A client that says "editable" where the bridge 403s drops the user's
// edit silently, so the two must be the same predicate over the same table.

import assert from "node:assert/strict";
import test from "node:test";

import {
  canMovePage,
  canWritePage,
  type PageAccessContext,
} from "../../src/shared/lib/auth/pageAccess.ts";
// @ts-expect-error — bridge modules are plain JS (Node built-ins only), no types.
import { canWritePageRow, pageRowToEntry } from "../../scripts/bridge-api.mjs";
// @ts-expect-error — bridge modules are plain JS (Node built-ins only), no types.
import { SHARE_LEVELS } from "../../scripts/bridge-share-rules.mjs";
import { MARKETPLACE_WORKSPACE_ID } from "../../src/features/marketplace/model/appMeta.ts";

type Row = Record<string, unknown>;
type Permission = "update" | "delete";
type Member = { role: string; permissions: string[] };
type ShareRule = {
  _id: string;
  workspaceId: string;
  resourceId: string | null;
  resourceType: "page";
  target: { type: "user"; userId: string } | { type: "role"; role: string } | { type: "workspace" } | { type: "public" };
  permission: (typeof SHARE_LEVELS)[number];
  explicit: boolean;
};

const ALL = ["create", "read", "update", "delete", "admin"];
const SELF = "b2b2b2b2-2222-4222-8222-b2b2b2b2b2b2";
const OTHER = "a1a1a1a1-1111-4111-8111-a1a1a1a1a1a1";
const WS = "c3c3c3c3-3333-4333-8333-c3c3c3c3c3c3";
const PAGE = "e1e1e1e1-1111-4111-8111-e1e1e1e1e1e1";

const MEMBERS: Record<string, Member | null> = {
  owner: { role: "owner", permissions: ALL },
  admin: { role: "admin", permissions: ALL },
  editor: { role: "editor", permissions: ["create", "read", "update"] },
  "editor+delete": { role: "editor", permissions: ["create", "read", "update", "delete"] },
  "admin-perm-only": { role: "editor", permissions: ["read", "admin"] },
  viewer: { role: "viewer", permissions: ["read"] },
  none: null,
};
const OWNERS: Record<string, string | null> = { null: null, self: SELF, other: OTHER };
const COLLABS: Record<string, Array<{ userId: string; role: string }>> = {
  none: [],
  editor: [{ userId: SELF, role: "editor" }],
  viewer: [{ userId: SELF, role: "viewer" }],
  owner: [{ userId: SELF, role: "owner" }],
};
const VISIBILITIES = ["private", "shared", "public"];
const PERMISSIONS: Permission[] = ["update", "delete"];
const PUBLISHED = [false, true];

function makeRule(target: ShareRule["target"], level: (typeof SHARE_LEVELS)[number], resourceId: string | null = PAGE): ShareRule {
  return {
    _id: `rule-${target.type}-${level}-${resourceId ?? "wide"}`,
    workspaceId: WS,
    resourceId,
    resourceType: "page",
    target,
    permission: level,
    explicit: true,
  };
}

/**
 * The bridge's decision as the routes compose it (readablePageAccess + requirePageWrite):
 * a non-member never reaches the rules, and the workspace owner/admin keep their access
 * whatever the rules say, so they are evaluated with none.
 */
function serverWrite(row: Row, member: Member | null, permission: Permission, rules: ShareRule[]): boolean {
  const exempt = member === null || member.role === "owner" || member.role === "admin";
  return canWritePageRow(row, SELF, member, permission, exempt ? [] : rules);
}

function pageRow(owner: string | null, visibility: string, collaborators: unknown, published: boolean): Row {
  return {
    id: PAGE,
    workspace_id: WS,
    owner_id: owner,
    visibility,
    collaborators,
    title: "t",
    parent_page_id: null,
    archived_at: null,
    properties: published ? [{ key: "published", value: true }] : [],
    content: [],
    updated_at: "2026-10-01T00:00:00.000Z",
  };
}

function contextFor(member: Member | null): PageAccessContext {
  return {
    userId: SELF,
    workspaceIds: member ? [WS] : [],
    privateWorkspaceIds: [],
    sharedWorkspaceIds: member ? [WS] : [],
    memberAccess: member ? { [WS]: member } : {},
  };
}

/** The membership x owner half of the table (7 x 3). O(members x owners). */
function callers(): Array<{ label: string; member: Member | null; owner: string | null }> {
  const rows = [];
  for (const [memberName, member] of Object.entries(MEMBERS)) {
    for (const [ownerName, owner] of Object.entries(OWNERS)) {
      rows.push({ label: `member=${memberName} owner=${ownerName}`, member, owner });
    }
  }
  return rows;
}

/** The page half of the table (3 x 4 x 2). O(visibilities x collaborators x published). */
function pages(owner: string | null): Array<{ label: string; row: Row }> {
  const rows = [];
  for (const visibility of VISIBILITIES) {
    for (const [collabName, collaborators] of Object.entries(COLLABS)) {
      for (const published of PUBLISHED) {
        rows.push({
          label: `visibility=${visibility} collaborators=${collabName} published=${published}`,
          row: pageRow(owner, visibility, collaborators, published),
        });
      }
    }
  }
  return rows;
}

/** The whole 7 x 3 x 3 x 4 x 2 x 2 = 1008 table, caller-major. O(total rows). */
function tableRows(): Array<{
  label: string;
  row: Row;
  context: PageAccessContext;
  member: Member | null;
  permission: Permission;
}> {
  const rows = [];
  for (const caller of callers()) {
    for (const page of pages(caller.owner)) {
      for (const permission of PERMISSIONS) {
        rows.push({
          label: `${caller.label} ${page.label} permission=${permission}`,
          row: page.row,
          context: contextFor(caller.member),
          member: caller.member,
          permission,
        });
      }
    }
  }
  return rows;
}

/** Share-rule axis: crosses each base row with a share rule scenario. */
interface ShareRuleScenario {
  label: string;
  rules: ShareRule[];
}

function shareRuleScenarios(): ShareRuleScenario[] {
  const pageId = PAGE;
  const scenarios: ShareRuleScenario[] = [
    { label: "no-rules", rules: [] },
    { label: "self-can_view", rules: [makeRule({ type: "user", userId: SELF }, "can_view", pageId)] },
    { label: "self-can_edit", rules: [makeRule({ type: "user", userId: SELF }, "can_edit", pageId)] },
    { label: "self-full_access", rules: [makeRule({ type: "user", userId: SELF }, "full_access", pageId)] },
    { label: "self-no_access", rules: [makeRule({ type: "user", userId: SELF }, "no_access", pageId)] },
    { label: "other-can_edit", rules: [makeRule({ type: "user", userId: OTHER }, "can_edit", pageId)] },
    { label: "editor-role-can_edit", rules: [makeRule({ type: "role", role: "editor" }, "can_edit", pageId)] },
    { label: "workspace-can_view", rules: [makeRule({ type: "workspace" }, "can_view", pageId)] },
    { label: "workspace-can_edit", rules: [makeRule({ type: "workspace" }, "can_edit", pageId)] },
    { label: "public-can_view", rules: [makeRule({ type: "public" }, "can_view", pageId)] },
    { label: "public-can_edit", rules: [makeRule({ type: "public" }, "can_edit", pageId)] },
    { label: "wide-self-can_edit", rules: [makeRule({ type: "user", userId: SELF }, "can_edit", null)] },
    { label: "wide-workspace-can_edit", rules: [makeRule({ type: "workspace" }, "can_edit", null)] },
    { label: "self-can_comment", rules: [makeRule({ type: "user", userId: SELF }, "can_comment", pageId)] },
    { label: "self-can_view+wide-no_access", rules: [
      makeRule({ type: "user", userId: SELF }, "can_view", pageId),
      makeRule({ type: "workspace" }, "no_access", null),
    ]},
    { label: "self-can_edit+self-no_access", rules: [
      makeRule({ type: "user", userId: SELF }, "can_edit", pageId),
      makeRule({ type: "user", userId: SELF }, "no_access", pageId),
    ]},
  ];
  return scenarios;
}

/** The share-rule axis table: base rows x share rule scenarios. */
function shareRuleTableRows(): Array<{
  label: string;
  row: Row;
  context: PageAccessContext;
  member: Member | null;
  permission: Permission;
  rules: ShareRule[];
}> {
  const rows = [];
  for (const base of tableRows()) {
    for (const scenario of shareRuleScenarios()) {
      rows.push({
        ...base,
        label: `${base.label} share=${scenario.label}`,
        rules: scenario.rules,
      });
    }
  }
  return rows;
}

test("bridge canWritePageRow agrees with client canWritePage on all 1008 table rows", () => {
  let agreed = 0;
  const disagreements: string[] = [];
  for (const { label, row, context, member, permission } of tableRows()) {
    const server = canWritePageRow(row, SELF, member, permission);
    const client = canWritePage(pageRowToEntry(row), context, permission);
    if (server === client) {
      agreed += 1;
      continue;
    }
    disagreements.push(`${label}: bridge=${String(server)} client=${String(client)}`);
  }
  assert.deepEqual({ agreed, disagreements: disagreements.slice(0, 5) }, { agreed: 1008, disagreements: [] });
});

test("the table answers true for some rows and false for others", () => {
  let allowed = 0;
  for (const { row, context, member, permission } of tableRows()) {
    if (canWritePage(pageRowToEntry(row), context, permission)) allowed += 1;
  }
  assert.ok(allowed > 0 && allowed < 1008, `allowed=${allowed}`);
});

/** One spot row of the table, named the way tableRows() labels it. */
interface Spot {
  member: string;
  owner: string;
  visibility: string;
  collaborators: string;
  published: boolean;
}

function writeAnswer(spot: Spot): { update: boolean; delete: boolean } {
  const entry = pageRowToEntry(pageRow(
    OWNERS[spot.owner], spot.visibility, COLLABS[spot.collaborators], spot.published,
  ));
  const context = contextFor(MEMBERS[spot.member]);
  return {
    update: canWritePage(entry, context, "update"),
    delete: canWritePage(entry, context, "delete"),
  };
}

test("a viewer who owns nothing cannot write in a shared workspace", () => {
  const spot: Spot = { member: "viewer", owner: "other", visibility: "shared", collaborators: "none", published: false };
  assert.deepEqual(writeAnswer(spot), { update: false, delete: false });
});

test("an editor without delete writes but does not delete in a shared workspace", () => {
  const spot: Spot = { member: "editor", owner: "other", visibility: "shared", collaborators: "none", published: false };
  assert.deepEqual(writeAnswer(spot), { update: true, delete: false });
});

test("a page collaborator editor does not grant write without a workspace permission", () => {
  const spot: Spot = { member: "viewer", owner: "other", visibility: "private", collaborators: "editor", published: false };
  assert.deepEqual(writeAnswer(spot), { update: false, delete: false });
});

test("the page owner writes while still a member, whatever the role", () => {
  const spot: Spot = { member: "viewer", owner: "self", visibility: "private", collaborators: "none", published: false };
  assert.deepEqual(writeAnswer(spot), { update: true, delete: true });
});

test("a page owner who left the workspace writes nothing (C557)", () => {
  const spot: Spot = { member: "none", owner: "self", visibility: "private", collaborators: "none", published: false };
  assert.deepEqual(writeAnswer(spot), { update: false, delete: false });
});

test("a marketplace app's owner writes it without membership; nobody else does (C557)", () => {
  for (const [owner, expected] of [[SELF, true], [OTHER, false]] as const) {
    const row = { ...pageRow(owner, "private", [], false), workspace_id: MARKETPLACE_WORKSPACE_ID };
    const entry = pageRowToEntry(row);
    for (const permission of ["update", "delete"] as const) {
      assert.equal(serverWrite(row, null, permission, []), expected, `bridge ${permission} owner=${owner}`);
      assert.equal(canWritePage(entry, contextFor(null), permission), expected, `client ${permission} owner=${owner}`);
    }
  }
});

test("an admin permission alone writes an ownerless page no more", () => {
  const spot: Spot = { member: "admin-perm-only", owner: "null", visibility: "shared", collaborators: "none", published: false };
  assert.deepEqual(writeAnswer(spot), { update: false, delete: false });
});

test("a membership carrying update still writes an ownerless page", () => {
  const spot: Spot = { member: "editor", owner: "null", visibility: "shared", collaborators: "none", published: false };
  assert.deepEqual(writeAnswer(spot), { update: true, delete: false });
});

test("a published app page is closed even to an admin permission", () => {
  const spot: Spot = { member: "admin-perm-only", owner: "null", visibility: "shared", collaborators: "none", published: true };
  assert.deepEqual(writeAnswer(spot), { update: false, delete: false });
});

const SOURCE_WS = "d4d4d4d4-4444-4444-8444-d4d4d4d4d4d4";
const TARGET_WS = "f5f5f5f5-5555-4555-8555-f5f5f5f5f5f5";
const SOURCE_MEMBER: Member = { role: "editor", permissions: ["create", "read", "update", "delete"] };

function moveContext(target: Member): PageAccessContext {
  return {
    userId: SELF,
    workspaceIds: [SOURCE_WS, TARGET_WS],
    privateWorkspaceIds: [],
    sharedWorkspaceIds: [SOURCE_WS, TARGET_WS],
    memberAccess: { [SOURCE_WS]: SOURCE_MEMBER, [TARGET_WS]: target },
  };
}

function movePage(ownerId: string | null): ReturnType<typeof pageRowToEntry> {
  return pageRowToEntry({
    id: PAGE,
    workspace_id: SOURCE_WS,
    owner_id: ownerId,
    visibility: "shared",
    collaborators: [],
    title: "t",
    properties: [],
  });
}

test("an editor who does not own the page cannot move it to another workspace", () => {
  const context = moveContext({ role: "viewer", permissions: ["read"] });
  assert.equal(canMovePage(movePage(OTHER), TARGET_WS, context), false);
});

test("the page owner moves the page when the target grants create", () => {
  const context = moveContext({ role: "viewer", permissions: ["read", "create"] });
  assert.equal(canMovePage(movePage(SELF), TARGET_WS, context), true);
});

test("the page owner cannot move the page into a workspace without create", () => {
  const context = moveContext({ role: "viewer", permissions: ["read"] });
  assert.equal(canMovePage(movePage(SELF), TARGET_WS, context), false);
});

test("an editor may reorder a page inside its own workspace", () => {
  const context = moveContext({ role: "viewer", permissions: ["read"] });
  assert.equal(canMovePage(movePage(OTHER), SOURCE_WS, context), true);
});

/** Share-rule axis: bridge and client must agree when share rules are present. */
test("bridge canWritePageRow agrees with client canWritePage on all share-rule axis rows", () => {
  let agreed = 0;
  const disagreements: string[] = [];
  for (const { label, row, context, member, permission, rules } of shareRuleTableRows()) {
    const server = serverWrite(row, member, permission, rules);
    const client = canWritePage(pageRowToEntry(row), context, permission, rules);
    if (server === client) {
      agreed += 1;
      continue;
    }
    disagreements.push(`${label}: bridge=${String(server)} client=${String(client)}`);
  }
  const total = shareRuleTableRows().length;
  assert.deepEqual({ agreed, disagreements: disagreements.slice(0, 10) }, { agreed: total, disagreements: [] });
});

test("the share-rule axis answers true for some rows and false for others", () => {
  let allowed = 0;
  for (const { row, context, member, permission, rules } of shareRuleTableRows()) {
    if (canWritePage(pageRowToEntry(row), context, permission, rules)) allowed += 1;
  }
  const total = shareRuleTableRows().length;
  assert.ok(allowed > 0 && allowed < total, `allowed=${allowed}/${total}`);
});

/** Spot tests for share-rule scenarios. */
interface ShareSpot extends Spot {
  ruleLabel: string;
  rules: ShareRule[];
}

function shareWriteAnswer(spot: ShareSpot): { update: boolean; delete: boolean } {
  const entry = pageRowToEntry(pageRow(
    OWNERS[spot.owner], spot.visibility, COLLABS[spot.collaborators], spot.published,
  ));
  const context = contextFor(MEMBERS[spot.member]);
  return {
    update: canWritePage(entry, context, "update", spot.rules),
    delete: canWritePage(entry, context, "delete", spot.rules),
  };
}

const SPOT_BASE = { member: "viewer", owner: "other", visibility: "private", collaborators: "none", published: false } as const;
const DENIED = { update: false, delete: false };
const ALLOWED = { update: true, delete: true };
type Level = (typeof SHARE_LEVELS)[number];
const forSelf = (level: Level, resourceId: string | null = PAGE) => makeRule({ type: "user", userId: SELF }, level, resourceId);
const workspaceWide = (level: Level) => makeRule({ type: "workspace" }, level, null);

// [name, the spot's differences from SPOT_BASE, the expected write answer]
const RULE_SPOTS: Array<[string, Partial<ShareSpot> & Pick<ShareSpot, "ruleLabel" | "rules">, typeof DENIED]> = [
  ["a can_view rule for self grants read but not write", { ruleLabel: "self-can_view", rules: [forSelf("can_view")] }, DENIED],
  ["a can_edit rule for self grants write on a private page", { ruleLabel: "self-can_edit", rules: [forSelf("can_edit")] }, ALLOWED],
  ["a no_access rule for self denies write even with update permission",
    { member: "editor", visibility: "shared", ruleLabel: "self-no_access", rules: [forSelf("no_access")] }, DENIED],
  // The page owner who is still a member is exempt from share rules on the server; the client mirrors that.
  ["a no_access rule for self does not take the write from a member page owner",
    { owner: "self", ruleLabel: "self-no_access", rules: [forSelf("no_access")] }, ALLOWED],
  ["a no_access rule for self leaves an ex-member page owner without write",
    { member: "none", owner: "self", ruleLabel: "self-no_access", rules: [forSelf("no_access")] }, DENIED],
  ["a can_comment rule does not grant write", { ruleLabel: "self-can_comment", rules: [forSelf("can_comment")] }, DENIED],
  ["a workspace-wide can_edit rule grants write", { ruleLabel: "wide-workspace-can_edit", rules: [workspaceWide("can_edit")] }, ALLOWED],
  ["a rule for another user does not affect self",
    { ruleLabel: "other-can_edit", rules: [makeRule({ type: "user", userId: OTHER }, "can_edit", PAGE)] }, DENIED],
  ["a can_edit rule plus a no_access rule for same target: no_access wins",
    { ruleLabel: "self-can_edit+self-no_access", rules: [forSelf("can_edit"), forSelf("no_access")] }, DENIED],
  ["a page-scoped can_view plus workspace-wide no_access: no_access wins",
    { ruleLabel: "self-can_view+wide-no_access", rules: [forSelf("can_view"), workspaceWide("no_access")] }, DENIED],
  ["a no_access rule naming a workspace admin does not take their write away",
    { member: "admin", visibility: "shared", ruleLabel: "self-no_access", rules: [forSelf("no_access")] }, ALLOWED],
  ["a can_edit rule does not let a non-member write",
    { member: "none", visibility: "public", ruleLabel: "self-can_edit", rules: [forSelf("can_edit")] }, DENIED],
  ["a can_edit rule for another page grants nothing on this one",
    { ruleLabel: "other-page", rules: [forSelf("can_edit", "f2f2f2f2-2222-4222-8222-f2f2f2f2f2f2")] }, DENIED],
];

for (const [name, spot, expected] of RULE_SPOTS) {
  test(name, () => assert.deepEqual(shareWriteAnswer({ ...SPOT_BASE, ...spot } as ShareSpot), expected));
}

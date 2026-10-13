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

type Row = Record<string, unknown>;
type Permission = "update" | "delete";
type Member = { role: string; permissions: string[] };

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

test("the page owner writes whatever their membership says", () => {
  const spot: Spot = { member: "none", owner: "self", visibility: "private", collaborators: "none", published: false };
  assert.deepEqual(writeAnswer(spot), { update: true, delete: true });
});

test("an admin permission alone carries both writes on an unpublished page", () => {
  const spot: Spot = { member: "admin-perm-only", owner: "null", visibility: "shared", collaborators: "none", published: false };
  assert.deepEqual(writeAnswer(spot), { update: true, delete: true });
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
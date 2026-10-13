/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-read-agreement.test.ts                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The bridge's read rule (scripts/bridge-page-read.mjs) must agree with the client's
// canReadPage on exactly what the client receives — the row after pageRowToEntry.
// Lives here because this runner strips TS (tests/bridge has no TS loader).

import assert from "node:assert/strict";
import test from "node:test";

import { canReadPage, type PageAccessContext } from "../../src/shared/lib/auth/pageAccess.ts";
// @ts-expect-error — bridge modules are plain JS (Node built-ins only), no types.
import { canReadPageRow } from "../../scripts/bridge-page-read.mjs";
// @ts-expect-error — bridge modules are plain JS (Node built-ins only), no types.
import { pageRowToEntry } from "../../scripts/bridge-api.mjs";

type Row = Record<string, unknown>;

const SELF = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const WORKSPACE = "c0c0c0c0-3333-4333-8333-c0c0c0c0c0c0";
const context: PageAccessContext = { userId: SELF, workspaceIds: [WORKSPACE], privateWorkspaceIds: [], sharedWorkspaceIds: [WORKSPACE] };

const VISIBILITIES = [null, "private", "shared", "public", "bogus"];
const OWNERS: Record<string, string | null> = { null: null, self: SELF, other: OTHER, "self-UPPERCASE": SELF.toUpperCase() };
const COLLABORATORS: Record<string, unknown> = {
  null: null,
  "[]": [],
  "self+role": [{ userId: SELF, role: "viewer" }],
  "self+null role": [{ userId: SELF, role: null }],
  other: [{ userId: OTHER, role: "editor" }],
  "a string": JSON.stringify([{ userId: SELF, role: "viewer" }]),
  "an object": { userId: SELF, role: "viewer" },
  "[null]": [null],
};

function tableRows(): Array<{ label: string; collaborators: string; row: Row }> {
  const rows = [];
  for (const visibility of VISIBILITIES) {
    for (const [owner, ownerId] of Object.entries(OWNERS)) {
      for (const [collaborators, value] of Object.entries(COLLABORATORS)) {
        const row = { id: "p1", workspace_id: WORKSPACE, title: "t", visibility, owner_id: ownerId, collaborators: value };
        rows.push({ label: `visibility=${visibility} owner=${owner} collaborators=${collaborators}`, collaborators, row });
      }
    }
  }
  return rows;
}

function clientAnswer(row: Row): boolean | "throws" {
  try {
    return canReadPage(pageRowToEntry(row), context);
  } catch {
    return "throws";
  }
}

// UUIDs are case-insensitive; the bridge folds case (SEC1 condition 3), the client does not.
const foldOwnerCase = (row: Row): Row => ({ ...row, owner_id: typeof row.owner_id === "string" ? row.owner_id.toLowerCase() : row.owner_id });

test("bridge canReadPageRow agrees with client canReadPage on all 160 table rows", () => {
  let agreed = 0;
  let clientThrew = 0;
  for (const { label, collaborators, row } of tableRows()) {
    const server = canReadPageRow(row, SELF);
    const client = clientAnswer(foldOwnerCase(row));
    if (client === "throws") {
      // The client dereferences a null collaborator entry; the bridge skips it and answers as for [].
      assert.equal(collaborators, "[null]", label);
      assert.equal(server, canReadPageRow({ ...row, collaborators: [] }, SELF), label);
      clientThrew += 1;
      continue;
    }
    assert.equal(server, client, label);
    agreed += 1;
  }
  assert.deepEqual({ agreed, clientThrew }, { agreed: 154, clientThrew: 6 });
});

test("the one deliberate difference: an upper-case owner id reads on the bridge, not on the client", () => {
  const row = { id: "p1", workspace_id: WORKSPACE, visibility: "private", owner_id: SELF.toUpperCase(), collaborators: [] };
  assert.equal(canReadPageRow(row, SELF), true);
  assert.equal(clientAnswer(row), false);
});

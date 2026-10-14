/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-read-only.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The page view must open read-only whenever the bridge would refuse the PATCH a
// keystroke sends (scripts/bridge-api.mjs:3005 asks 'update'): otherwise the
// outbox drops the edit and it is lost on the next reload without a word. Shapes
// reuse bridge-page-write-agreement.test.ts — the page belongs to another user,
// is shared, and lives in a workspace the caller is a member of.

import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "../../src/entities/page/model/types.ts";
import type { PageAccessContext } from "../../src/shared/lib/auth/pageAccess.ts";
import { isPageReadOnly } from "../../src/shared/lib/auth/pageReadOnly.ts";

const SELF = "b2b2b2b2-2222-4222-8222-b2b2b2b2b2b2";
const OTHER = "a1a1a1a1-1111-4111-8111-a1a1a1a1a1a1";
const WS = "c3c3c3c3-3333-4333-8333-c3c3c3c3c3c3";
const PAGE_ID = "e1e1e1e1-1111-4111-8111-e1e1e1e1e1e1";

interface Member {
  role: string;
  permissions: string[];
}

function accessContext(member: Member): PageAccessContext {
  return {
    userId: SELF,
    workspaceIds: [WS],
    privateWorkspaceIds: [],
    sharedWorkspaceIds: [WS],
    memberAccess: { [WS]: member },
  };
}

function sharedPage(): PageEntry {
  return {
    _id: PAGE_ID,
    title: "Shared page",
    workspaceId: WS,
    ownerId: OTHER,
    visibility: "shared",
    collaborators: [],
    properties: [],
  };
}

test("a viewer membership opens the page read-only", () => {
  const viewer: Member = { role: "viewer", permissions: ["read"] };
  assert.equal(isPageReadOnly(sharedPage(), accessContext(viewer), false), true);
});

test("an editor membership with update leaves the page editable", () => {
  const editor: Member = { role: "editor", permissions: ["create", "read", "update"] };
  assert.equal(isPageReadOnly(sharedPage(), accessContext(editor), false), false);
});

test("the caller's own config lock wins over an edit permission", () => {
  const editor: Member = { role: "editor", permissions: ["create", "read", "update"] };
  assert.equal(isPageReadOnly(sharedPage(), accessContext(editor), true), true);
});

test("no page loaded yet never flashes a lock", () => {
  const viewer: Member = { role: "viewer", permissions: ["read"] };
  assert.equal(isPageReadOnly(undefined, accessContext(viewer), false), false);
});

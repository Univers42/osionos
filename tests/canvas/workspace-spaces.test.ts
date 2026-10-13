/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspace-spaces.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 03:25:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 03:25:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Every workspace has a Private and a Shared space in the sidebar, whether the
// signed-in user owns it or is a member of an organisation's workspace.

import assert from "node:assert/strict";
import test from "node:test";

import { isMyPrivatePage, workspaceSpaces } from "../../src/widgets/sidebar/model/workspaceSpaces.ts";

const ME = "user-me";
const OTHER = "user-other";

test("a workspace the user owns has a Private section and no member Shared listing", () => {
  assert.deepEqual(workspaceSpaces("ws-1", ME, ME), { privateWorkspaces: [{ _id: "ws-1" }], sharedWorkspaces: [] });
});

test("an organisation's workspace has a Private section too, not only Shared", () => {
  assert.deepEqual(workspaceSpaces("ws-org", OTHER, ME), { privateWorkspaces: [{ _id: "ws-org" }], sharedWorkspaces: [{ _id: "ws-org" }] });
});

test("no active workspace, no sections", () => {
  assert.deepEqual(workspaceSpaces("", OTHER, ME), { privateWorkspaces: [], sharedWorkspaces: [] });
});

test("isMyPrivatePage: only the user's own private pages, never agents, home, shared or legacy ones", () => {
  assert.equal(isMyPrivatePage({ ownerId: ME, visibility: "private", surface: "page" }, ME), true);
  assert.equal(isMyPrivatePage({ ownerId: ME, visibility: undefined, surface: undefined }, ME), true);
  assert.equal(isMyPrivatePage({ ownerId: ME, visibility: "shared", surface: "page" }, ME), false);
  assert.equal(isMyPrivatePage({ ownerId: ME, visibility: "public", surface: "page" }, ME), false);
  assert.equal(isMyPrivatePage({ ownerId: OTHER, visibility: "private", surface: "page" }, ME), false);
  assert.equal(isMyPrivatePage({ ownerId: undefined, visibility: undefined, surface: "page" }, ME), false);
  assert.equal(isMyPrivatePage({ ownerId: ME, visibility: "private", surface: "agent" }, ME), false);
  assert.equal(isMyPrivatePage({ ownerId: ME, visibility: "private", surface: "home" }, ME), false);
  assert.equal(isMyPrivatePage({ ownerId: "", visibility: "private", surface: "page" }, ""), false);
});

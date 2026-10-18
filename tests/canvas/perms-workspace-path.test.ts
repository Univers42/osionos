/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   perms-workspace-path.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// G6 F6: the bridge's permission-engine reads and decide are scoped to a workspace the
// caller can read, so every client call names its workspace in `?workspaceId=`.

import assert from "node:assert/strict";
import test from "node:test";

import { permsPathFor } from "../../src/features/share/permsPath.ts";

const WORKSPACE = "c0c0c0c0-3333-4333-8333-c0c0c0c0c0c0";

test("permsPathFor puts the workspace on the query string", () => {
  assert.equal(permsPathFor("/api/perms/roles", WORKSPACE), `/api/perms/roles?workspaceId=${WORKSPACE}`);
  assert.equal(permsPathFor("/api/perms/decide", WORKSPACE), `/api/perms/decide?workspaceId=${WORKSPACE}`);
});

test("permsPathFor encodes the workspace id", () => {
  assert.equal(permsPathFor("/api/perms/people", "a b&c"), "/api/perms/people?workspaceId=a%20b%26c");
});

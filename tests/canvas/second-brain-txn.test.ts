/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   second-brain-txn.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { buildRecordUpdate, parseNodeId } from "../../src/features/second-brain/baas/buildRecordTxn.ts";
import { patchNodeFields } from "../../src/features/second-brain/baas/patchNode.ts";
import { mapGraphResponse } from "../../src/features/second-brain/baas/mapGraphResponse.ts";

test("buildRecordUpdate: single-mount atomic update filtered on id", () => {
  const request = buildRecordUpdate("pg_notes:notes:n1", { title: "Renamed" });
  assert.deepEqual(request, {
    mount: "pg_notes",
    operations: [{ op: "update", resource: "notes", filter: { id: "n1" }, data: { title: "Renamed" } }],
  });
});

test("parseNodeId: pk may itself contain colons", () => {
  assert.deepEqual(parseNodeId("m:r:a:b:c"), { mount: "m", resource: "r", pk: "a:b:c" });
});

test("patchNodeFields: optimistic field + label update, edges untouched (non-structural)", () => {
  const base = mapGraphResponse({
    depth: 1,
    guarantee: "subgraph_eventual",
    nodes: [
      { id: "pg:notes:n1", mount: "pg", resource: "notes", pk: "n1", data: { title: "Old", body: "x" } },
      { id: "pg:notes:n2", mount: "pg", resource: "notes", pk: "n2", data: { title: "Two" } },
    ],
    edges: [{ id: "e1", from: "pg:notes:n1", to: "pg:notes:n2", type: "note_link" }],
  }).model;

  const next = patchNodeFields(base, "pg:notes:n1", { title: "New" });
  const updated = next.nodeById.get("pg:notes:n1");
  assert.equal(updated?.label, "New"); // label tracks the title field
  assert.equal((updated?.fields as Record<string, unknown>).title, "New");
  assert.equal((updated?.fields as Record<string, unknown>).body, "x"); // other fields preserved
  // edges unchanged → non-structural, so the layout won't reheat.
  assert.equal(next.stats.edges, base.stats.edges);
  assert.equal(next.nodeById.get("pg:notes:n2")?.label, "Two");
});

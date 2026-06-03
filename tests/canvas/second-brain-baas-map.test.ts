/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   second-brain-baas-map.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { mapGraphResponse } from "../../src/features/second-brain/baas/mapGraphResponse.ts";
import { accumulateGraph } from "../../src/features/second-brain/baas/accumulateGraph.ts";
import type { BaasGraphResponse } from "../../src/features/second-brain/baas/types.ts";

// Fixture mirroring the live cross-DATABASE demo (graph-contract.md §6): a
// Postgres note linked to a MySQL user (explicit), a parsed [[note_link]], and a
// tagged edge whose target row is absent (dangling → unresolved placeholder).
const N1 = "pg_notes:notes:n1";
const U1 = "my_users:users:u1";
const N2 = "pg_notes:notes:n2";
const TAG = "pg_notes:tags:graph";

function fixture(): BaasGraphResponse {
  return {
    focus: N1,
    depth: 1,
    guarantee: "subgraph_eventual",
    nodes: [
      { id: N1, mount: "pg_notes", resource: "notes", pk: "n1", data: { title: "Atomic graph", body: "see [[pg_notes:notes:n2]]" } },
      { id: U1, mount: "my_users", resource: "users", pk: "u1", data: { name: "alice" } },
      { id: N2, mount: "pg_notes", resource: "notes", pk: "n2", data: { title: "Second note" } },
    ],
    edges: [
      { id: "e1", from: N1, to: U1, type: "author", directed: true },
      { id: "e2", from: N1, to: N2, type: "note_link" },
      { id: "e3", from: N1, to: TAG, type: "tagged" },
    ],
  };
}

test("mapGraphResponse: from/to → source/target, kinds, cross-DB, guarantee", () => {
  const { model, guarantee } = mapGraphResponse(fixture());

  assert.equal(guarantee, "subgraph_eventual");
  assert.equal(model.stats.nodes, 4); // 3 real + 1 dangling tag placeholder
  assert.equal(model.stats.edges, 3);

  const n1 = model.nodeById.get(N1);
  assert.equal(n1?.label, "Atomic graph");
  assert.equal(n1?.source, "pg_notes");
  assert.equal(n1?.databaseId, "notes");

  // Cross-DATABASE: the user node lives in a different backend/source.
  const u1 = model.nodeById.get(U1);
  assert.equal(u1?.source, "my_users");
  assert.equal(u1?.label, "alice");

  // Dangling tag target became an unresolved tag node.
  const tag = model.nodeById.get(TAG);
  assert.equal(tag?.kind, "tag");
  assert.equal(tag?.label, "graph");

  const authorEdge = model.edges.find((edge) => edge.source === N1 && edge.target === U1);
  assert.ok(authorEdge, "explicit author edge maps from→source / to→target");
  assert.equal(authorEdge?.kind, "relation");
  assert.equal(authorEdge?.directed, true);

  assert.equal(model.edges.find((edge) => edge.target === N2)?.kind, "note_link");
  assert.equal(model.edges.find((edge) => edge.target === TAG)?.kind, "tag");
});

test("mapGraphResponse: missing label fields fall back to pk", () => {
  const { model } = mapGraphResponse({
    depth: 1,
    guarantee: "per_node_atomic",
    nodes: [{ id: "m:r:42", mount: "m", resource: "r", pk: "42", data: { qty: 7 } }],
    edges: [],
  });
  assert.equal(model.nodeById.get("m:r:42")?.label, "42");
});

test("accumulateGraph: union + dedupe across expanded neighborhoods", () => {
  const first = mapGraphResponse(fixture()).model;
  const second = mapGraphResponse({
    focus: N2,
    depth: 1,
    guarantee: "subgraph_eventual",
    nodes: [
      { id: N2, mount: "pg_notes", resource: "notes", pk: "n2", data: { title: "Second note" } },
      { id: "pg_notes:notes:n3", mount: "pg_notes", resource: "notes", pk: "n3", data: { title: "Third" } },
    ],
    edges: [{ id: "e9", from: N2, to: "pg_notes:notes:n3", type: "note_link" }],
  }).model;

  const merged = accumulateGraph(first, second);
  assert.equal(merged.stats.nodes, 5); // n1, u1, n2, tag, n3 (n2 de-duped)
  assert.ok(merged.nodeById.has("pg_notes:notes:n3"));
  assert.ok(merged.edges.some((edge) => edge.target === "pg_notes:notes:n3"));
});

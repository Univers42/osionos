/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   second-brain-note.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { buildDemoteTxn, buildPromoteTxn, overlayNodeId } from "../../src/features/second-brain/baas/buildNoteTxn.ts";
import { applyDemote, applyPromote } from "../../src/features/second-brain/baas/notePatch.ts";
import { mapGraphResponse } from "../../src/features/second-brain/baas/mapGraphResponse.ts";
import type { BaasGraphResponse } from "../../src/features/second-brain/baas/types.ts";

const PG = "pg_main";
const N1 = `${PG}:og_nodes:n1`;

test("buildPromoteTxn: atomic overlay insert + note_of edge in one mount", () => {
  const request = buildPromoteTxn({
    mount: PG, overlayResource: "og_overlays", edgesResource: "og_edges",
    overlayId: "ov1", edgeId: "noe1", sourceNodeId: N1, body: "hello",
  });
  assert.equal(request.mount, PG);
  assert.equal(request.operations.length, 2);
  assert.deepEqual(request.operations[0], { op: "insert", resource: "og_overlays", data: { id: "ov1", body: "hello", color: "violet" } });
  assert.deepEqual(request.operations[1], {
    op: "insert", resource: "og_edges",
    data: { id: "noe1", from: `${PG}:og_overlays:ov1`, to: N1, type: "note_of" },
  });
});

test("buildDemoteTxn: deletes the note_of edge and the overlay row", () => {
  const request = buildDemoteTxn({ mount: PG, overlayResource: "og_overlays", edgesResource: "og_edges", overlayId: "ov1", edgeId: "noe1" });
  assert.deepEqual(request.operations, [
    { op: "delete", resource: "og_edges", filter: { id: "noe1" } },
    { op: "delete", resource: "og_overlays", filter: { id: "ov1" } },
  ]);
});

test("mapper detects note overlays structurally from note_of edges", () => {
  const overlay = overlayNodeId(PG, "og_overlays", "ov1");
  const { model } = mapGraphResponse({
    focus: N1, depth: 1, guarantee: "subgraph_eventual",
    nodes: [
      { id: N1, mount: PG, resource: "og_nodes", pk: "n1", data: { title: "Atomic graph" } },
      { id: overlay, mount: PG, resource: "og_overlays", pk: "ov1", data: { body: "my note" } },
    ],
    edges: [{ id: "noe1", from: overlay, to: N1, type: "note_of" }],
  } satisfies BaasGraphResponse);

  assert.equal(model.nodeById.get(overlay)?.kind, "note", "overlay (from of note_of) is a note");
  assert.equal(model.nodeById.get(N1)?.hasNote, true, "annotated record gets the note ring");
  assert.equal(model.edges.find((edge) => edge.kind === "note_of")?.recordId, "noe1", "wire edge id carried for demote");
});

test("viewer scoping: other users' PRIVATE notes are hidden; own private + public stay", () => {
  const response: BaasGraphResponse = {
    depth: 1, guarantee: "subgraph_eventual",
    nodes: [
      { id: "m:og_notes:a", mount: "m", resource: "og_notes", pk: "a", data: { title: "Alice private", owner: "alice", visibility: "private" } },
      { id: "m:og_notes:b", mount: "m", resource: "og_notes", pk: "b", data: { title: "Alice public", owner: "alice", visibility: "public" } },
      { id: "m:og_notes:c", mount: "m", resource: "og_notes", pk: "c", data: { title: "Bob private", owner: "bob", visibility: "private" } },
    ],
    edges: [],
  };
  const noteResources = new Set(["og_notes"]);

  const asAlice = mapGraphResponse(response, { noteResources, viewerId: "alice" }).model;
  assert.ok(asAlice.nodeById.has("m:og_notes:a"), "alice sees her own private note");
  assert.ok(asAlice.nodeById.has("m:og_notes:b"), "alice sees a public note");
  assert.equal(asAlice.nodeById.has("m:og_notes:c"), false, "alice does NOT see bob's private note");

  const asBob = mapGraphResponse(response, { noteResources, viewerId: "bob" }).model;
  assert.equal(asBob.nodeById.has("m:og_notes:a"), false, "bob does NOT see alice's private note");
  assert.ok(asBob.nodeById.has("m:og_notes:b"), "bob sees the public note");
  assert.ok(asBob.nodeById.has("m:og_notes:c"), "bob sees his own private note");
});

test("liveNoteIds: graph shows EXACTLY the sidebar's notes (others' shared notes hidden)", () => {
  const response: BaasGraphResponse = {
    depth: 1, guarantee: "subgraph_eventual",
    nodes: [
      { id: "m:og_notes:osio-note-mine", mount: "m", resource: "og_notes", pk: "osio-note-mine", data: { id: "osio-note-mine", title: "Mine", owner: "me", visibility: "private" } },
      { id: "m:og_notes:osio-note-shared", mount: "m", resource: "og_notes", pk: "osio-note-shared", data: { id: "osio-note-shared", title: "Another user's shared note", owner: "other", visibility: "shared" } },
    ],
    edges: [],
  };
  const noteResources = new Set(["og_notes"]);
  const liveNoteIds = new Set(["osio-note-mine"]); // only my note is in the page store / sidebar

  const model = mapGraphResponse(response, { noteResources, liveNoteIds }).model;
  assert.ok(model.nodeById.has("m:og_notes:osio-note-mine"), "my note (in the sidebar) shows");
  assert.equal(model.nodeById.has("m:og_notes:osio-note-shared"), false, "another user's shared note is NOT in the graph — it isn't in the sidebar");
});

test("parent edge → hierarchy kind with a stronger spring (child links to parent)", () => {
  const mongo = "ca";
  const child = `${mongo}:og_notes:osio-note-c`;
  const parent = `${mongo}:og_notes:osio-note-p`;
  const { model } = mapGraphResponse({
    depth: 1, guarantee: "subgraph_eventual",
    nodes: [
      { id: child, mount: mongo, resource: "og_notes", pk: "osio-note-c", data: { id: "osio-note-c", title: "Child" } },
      { id: parent, mount: mongo, resource: "og_notes", pk: "osio-note-p", data: { id: "osio-note-p", title: "Parent" } },
    ],
    edges: [{ id: "e1", from: child, to: parent, type: "parent" }],
  }, { noteResources: new Set(["og_notes"]) });
  const edge = model.edges.find((candidate) => candidate.recordId === "e1");
  assert.equal(edge?.kind, "hierarchy", "a 'parent' edge maps to the hierarchy kind");
  assert.ok((edge?.strength ?? 0) > 1.4, "hierarchy edge springs harder than a default relation edge");
});

test("node size reflects relationship count: degree drives weight, evidently", () => {
  const node = (pk: string) => ({ id: `m:og_nodes:${pk}`, mount: "m", resource: "og_nodes", pk, data: { title: pk } });
  const { model } = mapGraphResponse({
    depth: 1, guarantee: "subgraph_eventual",
    nodes: [node("hub"), node("leaf"), node("x"), node("y"), node("lonely")],
    edges: [
      { id: "e1", from: "m:og_nodes:hub", to: "m:og_nodes:leaf", type: "rel" },
      { id: "e2", from: "m:og_nodes:hub", to: "m:og_nodes:x", type: "rel" },
      { id: "e3", from: "m:og_nodes:hub", to: "m:og_nodes:y", type: "rel" },
    ],
  });
  const weight = (id: string) => model.nodeById.get(id)?.weight ?? 0;
  assert.ok(weight("m:og_nodes:hub") > weight("m:og_nodes:leaf"), "a hub (deg 3) is larger than a leaf (deg 1)");
  assert.ok(weight("m:og_nodes:leaf") > weight("m:og_nodes:lonely"), "a leaf (deg 1) is larger than an isolated node (deg 0)");
  assert.ok(weight("m:og_nodes:hub") - weight("m:og_nodes:leaf") > 0.15, "the hub↔leaf size gap is clearly evident");
});

test("applyPromote then applyDemote round-trips losslessly", () => {
  const base = mapGraphResponse({
    depth: 1, guarantee: "subgraph_eventual",
    nodes: [{ id: N1, mount: PG, resource: "og_nodes", pk: "n1", data: { title: "n1" } }],
    edges: [],
  }).model;
  const overlay = overlayNodeId(PG, "og_overlays", "ov1");

  const promoted = applyPromote(base, { overlayNodeId: overlay, body: "note text", sourceNodeId: N1, edgeRecordId: "noe1" });
  assert.equal(promoted.nodeById.get(overlay)?.kind, "note");
  assert.equal(promoted.nodeById.get(N1)?.hasNote, true);
  assert.equal(promoted.stats.edges, 1);

  const demoted = applyDemote(promoted, overlay, N1);
  assert.equal(demoted.nodeById.has(overlay), false, "overlay removed");
  assert.equal(demoted.nodeById.get(N1)?.hasNote, false, "note ring cleared");
  assert.equal(demoted.stats.edges, 0);
  assert.equal(demoted.stats.nodes, base.stats.nodes);
});

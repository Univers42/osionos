/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sb-live-check.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Headless live integration check for the Second Brain BaaS read+write path.
 * Drives osionos's OWN pure code (`mapGraphResponse`, `buildRecordUpdate`)
 * against the live BaaS, so it proves the real contract end-to-end (not a mock).
 *
 * No secrets are baked in — all config comes from the environment:
 *   SB_BAAS_URL SB_API_KEY SB_KONG_KEY SB_EDGES_DB SB_USERS_DB \
 *   node --experimental-strip-types \
 *     --experimental-loader ./tests/canvas/ts-extension-loader.mjs scripts/sb-live-check.ts
 */

import assert from "node:assert/strict";
import { mapGraphResponse } from "../src/features/second-brain/baas/mapGraphResponse.ts";
import { buildRecordUpdate } from "../src/features/second-brain/baas/buildRecordTxn.ts";
import { buildDemoteTxn, buildPromoteTxn, overlayNodeId } from "../src/features/second-brain/baas/buildNoteTxn.ts";
import type { BaasGraphResponse } from "../src/features/second-brain/baas/types.ts";

const BASE = need("SB_BAAS_URL");
const API_KEY = need("SB_API_KEY");
const KONG = process.env.SB_KONG_KEY ?? "";
const EDGES = need("SB_EDGES_DB");
const USERS = need("SB_USERS_DB");
const EDGES_TABLE = process.env.SB_EDGES_TABLE ?? "og_edges";

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

async function post(path: string, body: unknown): Promise<{ status: number; ok: boolean; json: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Baas-Api-Key": API_KEY };
  if (KONG) headers.apikey = KONG;
  const response = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: response.status, ok: response.ok, json: await response.json().catch(() => null) };
}

const generators = { noteField: "body", tags: { field: "tags", mount: EDGES, resource: "tags" } };

// 1) Overview → map through osionos's real mapper.
const overview = await post("/query/v1/graph/overview", {
  resources: [{ dbId: EDGES, table: "og_nodes" }, { dbId: USERS, table: "og_users" }],
  edgesDbId: EDGES,
  edgesTable: EDGES_TABLE,
  limit: 400,
  generators,
});
assert.ok(overview.ok, `overview HTTP ${overview.status}`);
const overviewModel = mapGraphResponse(overview.json as BaasGraphResponse).model;
const sources = new Set(overviewModel.nodes.map((node) => node.source));
assert.ok(overviewModel.stats.nodes >= 4, "overview has nodes");
assert.ok(overviewModel.stats.edges >= 1, "overview has edges");
assert.ok(sources.size >= 2, `cross-DB: ${[...sources].join(", ")}`);
console.log(`✔ overview: ${overviewModel.stats.nodes} nodes / ${overviewModel.stats.edges} edges across ${sources.size} backends [${[...sources].join(", ")}]`);

// 2) Focus(n1) → cross-DB authored_by + parsed note_link.
const n1 = `${EDGES}:og_nodes:n1`;
const focus = await post("/query/v1/graph", { focus: n1, depth: 1, edgesDbId: EDGES, edgesTable: EDGES_TABLE, generators });
assert.ok(focus.ok, `focus HTTP ${focus.status}`);
const focusMapped = mapGraphResponse(focus.json as BaasGraphResponse);
const u1 = `${USERS}:og_users:u1`;
const authored = focusMapped.model.edges.find((e) => e.source === n1 && e.target === u1);
assert.ok(authored, "authored_by edge n1→u1 present (cross-DB)");
assert.ok(focusMapped.model.edges.some((e) => e.kind === "note_link"), "note_link generated from [[..]]");
console.log(`✔ focus(n1): guarantee=${focusMapped.guarantee}, cross-DB authored_by→u1 (kind=${authored?.kind}), note_link present`);

// 3) Write path: a same-value /txn update via osionos's buildRecordUpdate (safe no-op).
const n3 = `${EDGES}:og_nodes:n3`;
const n3node = overviewModel.nodeById.get(n3);
const currentTitle = (n3node?.fields as Record<string, unknown> | undefined)?.title ?? "Third note";
const txnReq = buildRecordUpdate(n3, { title: currentTitle });
const txn = await post("/query/v1/txn", txnReq);
assert.ok(txn.ok, `txn HTTP ${txn.status}`);
assert.equal((txn.json as { guarantee?: string }).guarantee, "atomic", "single-mount txn is atomic");
console.log(`✔ txn save (buildRecordUpdate ${n3} → same-value, non-destructive): HTTP ${txn.status} guarantee=atomic`);

// 4) Phase 5 promote→demote round-trip (opt-in: SB_TEST_NOTE=1; mutates fixture, then cleans up).
if (process.env.SB_TEST_NOTE === "1") {
  const overlayId = `live-${Date.now()}`;
  const edgeId = `noe-${Date.now()}`;
  const overlay = overlayNodeId(EDGES, "og_overlays", overlayId);
  try {
    const promote = await post("/query/v1/txn", buildPromoteTxn({
      mount: EDGES, overlayResource: "og_overlays", edgesResource: EDGES_TABLE,
      overlayId, edgeId, sourceNodeId: n1, body: "live-check note",
    }));
    assert.ok(promote.ok, `promote HTTP ${promote.status}`);
    const afterPromote = mapGraphResponse((await post("/query/v1/graph", { focus: n1, depth: 1, edgesDbId: EDGES, edgesTable: EDGES_TABLE, generators })).json as BaasGraphResponse);
    assert.equal(afterPromote.model.nodeById.get(overlay)?.kind, "note", "overlay shows as note");
    assert.equal(afterPromote.model.nodeById.get(n1)?.hasNote, true, "n1 gains note ring");
    console.log(`✔ promote: overlay ${overlayId} + note_of edge → overlay renders as note, n1.hasNote=true`);
  } finally {
    const demote = await post("/query/v1/txn", buildDemoteTxn({ mount: EDGES, overlayResource: "og_overlays", edgesResource: EDGES_TABLE, overlayId, edgeId }));
    console.log(`✔ demote (cleanup): HTTP ${demote.status} guarantee=${(demote.json as { guarantee?: string }).guarantee}`);
  }
}

console.log("\nALL LIVE CHECKS PASSED — osionos read+write integration works against the deployed BaaS.");

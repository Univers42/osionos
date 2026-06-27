/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sb-sync-osionos.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Seed the BaaS graph with osionos's REAL canonical data as a genuine
 * POSTGRES + MONGODB cross-database graph (osionos-real-data-guide.md §8).
 *
 *   • CRM contacts          → Mongo `og_people`  via PLAIN /query insert
 *                             (Mongo is non-transactional — /txn would 400).
 *   • everything else       → Postgres `og_nodes` via atomic /txn batches.
 *   • every relation prop    → Postgres `og_edges` (the edges mount), incl. real
 *                             cross-DB links (e.g. a PG project → a Mongo person).
 *
 * Idempotent: run `--clean` (delete-by-id) then insert. Ids are `osio-<pageId>`
 * (logical ids round-trip on Mongo now). Batched ≤50 ops per single-mount /txn.
 *
 *   SB_BAAS_URL SB_API_KEY SB_KONG_KEY SB_EDGES_DB(PG) SB_MONGO_DB \
 *     node --experimental-strip-types \
 *       --experimental-loader ./tests/canvas/ts-extension-loader.mjs \
 *       scripts/sb-sync-osionos.ts [--clean]
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { textValue, arrayValue } from "../src/features/second-brain/model/value.ts";

const BASE = need("SB_BAAS_URL");
const API_KEY = need("SB_API_KEY");
const KONG = process.env.SB_KONG_KEY ?? "";
const PG = need("SB_EDGES_DB");
const MONGO = need("SB_MONGO_DB");
const NODES_TABLE = "og_nodes";
const PEOPLE_TABLE = "og_people";
const EDGES_TABLE = "og_edges";
const CLEAN = process.argv.includes("--clean");
const CRM_DB = "db-crm";

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

interface Op { op: "insert" | "delete"; resource?: string; data?: Record<string, unknown>; filter?: Record<string, unknown> }

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", "X-Baas-Api-Key": API_KEY };
  if (KONG) h.apikey = KONG;
  return h;
}

/** Atomic batch on a transactional mount (Postgres). */
async function txn(mount: string, operations: Op[]): Promise<void> {
  const response = await fetch(`${BASE}/query/v1/txn`, { method: "POST", headers: headers(), body: JSON.stringify({ mount, operations }) });
  if (!response.ok) throw new Error(`txn ${mount} HTTP ${response.status}: ${await response.text().catch(() => "")}`);
}

/** A single plain /query op — the only write path Mongo accepts. */
async function queryOp(mount: string, table: string, op: Op): Promise<void> {
  const body = { op: op.op, ...(op.data ? { data: op.data } : {}), ...(op.filter ? { filter: op.filter } : {}) };
  const response = await fetch(`${BASE}/query/v1/${mount}/tables/${table}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`query ${table} HTTP ${response.status}: ${await response.text().catch(() => "")}`);
}

async function batchedTxn(mount: string, ops: Op[], label: string): Promise<void> {
  for (let i = 0; i < ops.length; i += 50) {
    await txn(mount, ops.slice(i, i + 50));
    process.stdout.write(`  ${label}: ${Math.min(i + 50, ops.length)}/${ops.length}\r`);
  }
  if (ops.length) console.log(`  ${label}: ${ops.length}/${ops.length} ✔`);
}

async function runQuery(mount: string, table: string, ops: Op[], label: string): Promise<void> {
  for (let i = 0; i < ops.length; i += 1) {
    await queryOp(mount, table, ops[i]);
    process.stdout.write(`  ${label}: ${i + 1}/${ops.length}\r`);
  }
  if (ops.length) console.log(`  ${label}: ${ops.length}/${ops.length} ✔`);
}

// ---- load osionos's real seed state ----------------------------------------
const here = dirname(fileURLToPath(import.meta.url));
const statePath = join(here, "../src/shared/notion-database-sys/src/store/dbms/mongodb/_notion_state.json");
const state = JSON.parse(readFileSync(statePath, "utf-8")) as {
  databases: Record<string, { id: string; name: string; titlePropertyId: string; properties: Record<string, { id: string; name: string; type: string; relationConfig?: { databaseId: string } }> }>;
  pages: Record<string, { id: string; databaseId: string; archived?: boolean; properties: Record<string, unknown> }>;
};

const pages = Object.values(state.pages).filter((page) => !page.archived && state.databases[page.databaseId]);
const validIds = new Set(pages.map((page) => page.id));
const rowId = (pageId: string) => `osio-${pageId}`;
const isCrm = (databaseId: string) => databaseId === CRM_DB;
const nodeGraphId = (pageId: string, databaseId: string) =>
  isCrm(databaseId) ? `${MONGO}:${PEOPLE_TABLE}:${rowId(pageId)}` : `${PG}:${NODES_TABLE}:${rowId(pageId)}`;

function findProp(databaseId: string, match: RegExp, typeMatch?: RegExp) {
  return Object.values(state.databases[databaseId].properties).find(
    (property) => match.test(property.name) || (typeMatch ? typeMatch.test(property.type) : false),
  );
}

// ---- build operations -------------------------------------------------------
const pgOps: Op[] = [];
const mongoOps: Op[] = [];

for (const page of pages) {
  const db = state.databases[page.databaseId];
  const title = textValue(page.properties[db.titlePropertyId]) || "Untitled";
  if (isCrm(page.databaseId)) {
    mongoOps.push(CLEAN ? { op: "delete", filter: { id: rowId(page.id) } } : { op: "insert", data: { id: rowId(page.id), name: title } });
  } else {
    const bodyProp = findProp(page.databaseId, /desc|note|body|summary|bio|about/i);
    const tagsProp = findProp(page.databaseId, /tag/i, /multi/i);
    const body = bodyProp ? textValue(page.properties[bodyProp.id]).slice(0, 500) : "";
    const tags = tagsProp ? arrayValue(page.properties[tagsProp.id]) : [];
    pgOps.push(CLEAN
      ? { op: "delete", resource: NODES_TABLE, filter: { id: rowId(page.id) } }
      : { op: "insert", resource: NODES_TABLE, data: { id: rowId(page.id), title, body, tags } });
  }
}

// relation edges live in the PG/edges mount (their endpoints may be cross-DB)
const edgeOps: Op[] = [];
for (const page of pages) {
  const db = state.databases[page.databaseId];
  for (const property of Object.values(db.properties)) {
    if (property.type !== "relation" || !property.relationConfig) continue;
    const targetDb = property.relationConfig.databaseId;
    for (const targetId of arrayValue(page.properties[property.id])) {
      if (!validIds.has(targetId)) continue;
      const edgeId = `osio-e-${page.id}-${property.id}-${targetId}`;
      edgeOps.push(CLEAN
        ? { op: "delete", resource: EDGES_TABLE, filter: { id: edgeId } }
        : { op: "insert", resource: EDGES_TABLE, data: { id: edgeId, from: nodeGraphId(page.id, page.databaseId), to: nodeGraphId(targetId, targetDb), type: property.name } });
    }
  }
}

console.log(`${CLEAN ? "Removing" : "Syncing"} osionos data → BaaS (Postgres + MongoDB): ${pgOps.length} PG nodes, ${mongoOps.length} Mongo people, ${edgeOps.length} edges`);
await runQuery(MONGO, PEOPLE_TABLE, mongoOps, "Mongo people");
await batchedTxn(PG, [...pgOps, ...edgeOps], "PG nodes+edges");
console.log(CLEAN ? "\nCLEAN COMPLETE." : "\nSYNC COMPLETE — open the graph for a real Postgres + MongoDB view.");

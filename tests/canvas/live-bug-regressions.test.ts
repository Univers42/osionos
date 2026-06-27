/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-bug-regressions.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Regression pins for bugs found by live-probing the seeded stack (mocked
 * suites passed while the real gateway rejected the calls — every test here
 * asserts the EXACT wire detail that broke).
 */

import assert from "node:assert/strict";
import test from "node:test";

import { translateLivePageQuery } from "../../src/shared/notion-database-sys/src/store/live/liveQueryTranslator.ts";
import { collectLiveDdlIntents } from "../../src/shared/notion-database-sys/src/store/live/liveSchemaIntents.ts";
import { diffLiveState, type LiveStateDiff } from "../../src/shared/notion-database-sys/src/store/live/liveStateDiff.ts";
import { LIVE_MAX_ATTEMPTS, LiveWriteQueue } from "../../src/shared/notion-database-sys/src/store/live/liveWriteQueue.ts";
import { LiveWritePublisher } from "../../src/shared/notion-database-sys/src/store/live/liveWritePublisher.ts";
import { hashLiveRows } from "../../src/shared/notion-database-sys/src/store/live/livePoll.ts";
import type { LiveSchemaResponse } from "../../src/shared/notion-database-sys/src/store/live/liveTypes.ts";
import type { NotionState } from "../../src/shared/notion-database-sys/src/component/types";

const col = (name: string, normalized_type: string, extra: Record<string, unknown> = {}) => ({
  name, native_type: normalized_type, normalized_type, nullable: true,
  default: null, enum_values: null, references: null, inferred: false, ...extra,
});

const MONGO_SCHEMA = {
  dbId: "db-1", engine: "mongodb", capabilities: { transactions: false },
  tables: [{ name: "notes", primary_key: ["_id"], columns: [
    col("_id", "text"), col("body", "text"),
  ] }],
} as LiveSchemaResponse;

function memoryQueue(databaseId = "baas:db-1:notes") {
  const storage = new Map<string, string>();
  return new LiveWriteQueue(databaseId, {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value); },
  });
}

test("X1: sequential cell sends never carry the /txn-only `resource` field", async () => {
  // The single-op DTO is forbidNonWhitelisted: `resource` = guaranteed 400 →
  // every mongo cell edit snapped back. (Verified live before the fix.)
  const queue = memoryQueue();
  queue.enqueueCell("notes", "note-0001", { body: "hi" });
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    bodies.push(JSON.parse(init?.body ?? "{}") as Record<string, unknown>);
    return { status: 200, json: async () => ({ rows: [], affected_rows: 1 }) };
  }) as unknown as typeof fetch;
  const publisher = new LiveWritePublisher({
    mount: { dbId: "db-1", table: "notes" },
    queue,
    getSchema: async () => MONGO_SCHEMA,
    emit: () => {},
  });
  await publisher.drain();
  publisher.stop();
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].op, "update");
  assert.ok(!("resource" in bodies[0]), "single-table ops must not carry `resource`");
  assert.equal(queue.size(), 0);
});

test("T1: the filter grammar forks by engine (mongo dialect)", () => {
  const query = {
    databaseId: "baas:db-1:events",
    filter: {
      summary: { contains: "50% off (deal)" },
      order_ref: { exists: false },
      kind: { nin: ["login", "search"] },
    },
  };
  // sql grammar (filter.rs): $ilike + $null + top-level $not.
  const sql = translateLivePageQuery(query, "postgresql");
  const sqlAnd = (sql.params.filter as { $and: Record<string, unknown>[] }).$and;
  assert.ok(sqlAnd.some((node) => "$not" in node));
  assert.ok(JSON.stringify(sqlAnd).includes("$ilike"));
  assert.ok(JSON.stringify(sqlAnd).includes("$null"));
  // mongo native: $regex(+$options, regex-escaped) / $exists / $nin — the sql
  // ops above are 400s on the mongo allowlist (verified live).
  const mongo = translateLivePageQuery(query, "mongodb");
  const text = JSON.stringify(mongo.params.filter);
  assert.ok(!text.includes("$ilike") && !text.includes("$null") && !text.includes("$not"));
  const nodes = (mongo.params.filter as { $and: Record<string, unknown>[] }).$and;
  const summary = nodes.find((node) => "summary" in node)?.summary as Record<string, unknown>;
  assert.equal(summary.$regex, "50% off \\(deal\\)"); // regex-escaped, not LIKE-escaped
  assert.equal(summary.$options, "i");
  const orderRef = nodes.find((node) => "order_ref" in node)?.order_ref as Record<string, unknown>;
  assert.deepEqual(orderRef, { $exists: false });
  const kind = nodes.find((node) => "kind" in node)?.kind as Record<string, unknown>;
  assert.deepEqual(kind, { $nin: ["login", "search"] });
});

test("D2: derived/presentational schema drift never becomes engine DDL", () => {
  const diff: LiveStateDiff = {
    cellChanges: [], inserts: [], deletes: [], skipped: [],
    schemaAdds: [{ id: "__place", name: "Location", type: "place" }],
    schemaRemoves: ["__place", "prop-abc123"],
    schemaRetypes: [
      // Preset select-synthesis drift (text↔select) — presentation only.
      { propertyId: "status", fromType: "text", newType: "select",
        property: { id: "status", name: "Status", type: "select", options: [{ id: "a", value: "a", label: "a" }] } },
      { propertyId: "kind", fromType: "select", newType: "text",
        property: { id: "kind", name: "Kind", type: "text" } },
      // An honest retype still goes through.
      { propertyId: "qty", fromType: "text", newType: "number",
        property: { id: "qty", name: "Qty", type: "number" } },
    ],
  };
  const intents = collectLiveDdlIntents(diff, "cases");
  assert.equal(intents.requests.length, 1, JSON.stringify(intents.requests));
  assert.equal(intents.requests[0].op, "alter_column_type");
  assert.equal((intents.requests[0].column as { name: string }).name, "qty");
  assert.ok(intents.messages.some((message) => message.includes("presentation-only")));
});

test("Q1: a poison-pill entry is dropped after LIVE_MAX_ATTEMPTS", () => {
  const queue = memoryQueue();
  queue.enqueue({ kind: "ddl", table: "notes", request: { op: "drop_column" } });
  const id = queue.pending()[0].id;
  for (let attempt = 1; attempt < LIVE_MAX_ATTEMPTS; attempt += 1) {
    assert.equal(queue.noteFailure(id, LIVE_MAX_ATTEMPTS), false, `attempt ${attempt} keeps the entry`);
    assert.equal(queue.size(), 1);
  }
  assert.equal(queue.noteFailure(id, LIVE_MAX_ATTEMPTS), true, "final attempt drops it");
  assert.equal(queue.size(), 0, "the queue is unblocked");
});

test("E1: mongo row hashes are order-insensitive through the `id` alias", () => {
  const a = { id: "evt-1", summary: "x" };
  const b = { id: "evt-2", summary: "y" };
  const forward = hashLiveRows([a, b], ["_id"]);
  const reversed = hashLiveRows([b, a], ["_id"]);
  assert.equal(forward, reversed, "natural-order drift must not change the hash");
  const edited = hashLiveRows([a, { ...b, summary: "z" }], ["_id"]);
  assert.notEqual(forward, edited, "real changes still change the hash");
});

test("retypes carry fromType so presentational flips are detectable", () => {
  const database = {
    id: "baas:db-1:notes",
    name: "Notes",
    properties: { body: { id: "body", name: "Body", type: "text" } },
    titlePropertyId: "body",
  };
  const prev = { databases: { "baas:db-1:notes": database }, pages: {}, views: {} } as unknown as NotionState;
  const next = {
    databases: { "baas:db-1:notes": { ...database, properties: {
      body: { id: "body", name: "Body", type: "select", options: [] },
    } } },
    pages: {}, views: {},
  } as unknown as NotionState;
  const diff = diffLiveState(next, prev, "baas:db-1:notes");
  assert.equal(diff.schemaRetypes.length, 1);
  assert.equal(diff.schemaRetypes[0].fromType, "text");
  assert.equal(diff.schemaRetypes[0].newType, "select");
});

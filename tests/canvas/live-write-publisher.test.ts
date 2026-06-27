/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-write-publisher.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { LiveWriteQueue } from "../../src/shared/notion-database-sys/src/store/live/liveWriteQueue.ts";
import {
  LIVE_BACKOFF_MIN_MS,
  LiveWritePublisher,
} from "../../src/shared/notion-database-sys/src/store/live/liveWritePublisher.ts";
import type { LiveSchemaResponse } from "../../src/shared/notion-database-sys/src/store/live/liveTypes.ts";

const col = (name: string, normalized_type: string, extra: Record<string, unknown> = {}) => ({
  name, native_type: normalized_type, normalized_type, nullable: true,
  default: null, enum_values: null, references: null, inferred: false, ...extra,
});

const PG_SCHEMA = {
  dbId: "db-1", engine: "postgresql", capabilities: { transactions: true },
  tables: [{ name: "orders", primary_key: ["id"], columns: [
    col("id", "integer"), col("name", "text"), col("qty", "integer"),
    col("status", "enum", { enum_values: ["open", "paid"] }),
  ] }],
} as LiveSchemaResponse;

const MONGO_SCHEMA = {
  dbId: "db-1", engine: "mongodb", capabilities: { transactions: false },
  tables: [{ name: "orders", primary_key: ["_id"], columns: [
    col("_id", "objectid"), col("name", "text"), col("qty", "integer"),
  ] }],
} as LiveSchemaResponse;

interface Sent { url: string; body: Record<string, unknown> }

/** Stub global fetch with a scripted response queue; records every request. */
function mockFetch(responses: { status: number; body: unknown }[]): Sent[] {
  const sent: Sent[] = [];
  globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
    sent.push({ url: String(url), body: JSON.parse(init?.body ?? "{}") as Record<string, unknown> });
    const next = responses.shift() ?? { status: 200, body: { rows: [], affected_rows: 1 } };
    return { status: next.status, json: async () => next.body };
  }) as unknown as typeof fetch;
  return sent;
}

function makePublisher(schema: LiveSchemaResponse) {
  const storage = new Map<string, string>();
  const queue = new LiveWriteQueue("baas:db-1:orders", {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value); },
  });
  const events: { type: string }[] = [];
  const publisher = new LiveWritePublisher({
    mount: { dbId: "db-1", table: "orders" },
    queue,
    getSchema: async () => schema,
    emit: (event) => events.push(event),
  });
  return { queue, publisher, events };
}

test("postgresql cells drain as single-op updates (no /txn batch)", async () => {
  const { queue, publisher } = makePublisher(PG_SCHEMA);
  queue.enqueueCell("orders", "1", { qty: 3 });
  queue.enqueueCell("orders", "2", { status: "paid" });
  const ids = queue.pending().map((entry) => entry.id);
  const ok = { status: 200, body: { rows: [], affected_rows: 1 } };
  const sent = mockFetch([ok, ok]);
  await publisher.drain();
  publisher.stop();
  assert.equal(sent.length, 2); // one single-op update per cell (the /txn batch is gone)
  for (const request of sent) {
    assert.match(request.url, /\/api\/databases\/db-1\/tables\/orders$/);
    assert.equal(request.body.op, "update");
    assert.equal(request.body.resource, undefined); // /txn-only field stripped for single-op
  }
  const dataByPk = Object.fromEntries(sent.map((r) => [JSON.stringify(r.body.filter), r.body.data]));
  assert.deepEqual(dataByPk['{"id":1}'], { qty: 3 });
  assert.deepEqual(dataByPk['{"id":2}'], { status: "paid" });
  assert.deepEqual(new Set(sent.map((r) => r.body.idempotencyKey)), new Set(ids));
  assert.equal(queue.size(), 0); // both confirmed
});

test("mongodb cells drain sequentially as single op=update calls", async () => {
  const { queue, publisher } = makePublisher(MONGO_SCHEMA);
  queue.enqueueCell("orders", "a1", { qty: 4 });
  queue.enqueueCell("orders", "a2", { name: "B" });
  const sent = mockFetch([
    { status: 200, body: { rows: [], affected_rows: 1 } },
    { status: 200, body: { rows: [], affected_rows: 1 } },
  ]);
  await publisher.drain();
  publisher.stop();
  assert.equal(sent.length, 2);
  assert.match(sent[0].url, /\/api\/databases\/db-1\/tables\/orders$/);
  assert.equal(sent[0].body.op, "update");
  assert.deepEqual(sent[0].body.filter, { _id: "a1" });
  assert.equal(queue.size(), 0);
});

test("affected_rows 0 = gone: entry dropped + authoritative refetch emits the deletion", async () => {
  const { queue, publisher, events } = makePublisher(MONGO_SCHEMA);
  queue.enqueueCell("orders", "a1", { qty: 4 });
  const sent = mockFetch([
    { status: 200, body: { rows: [], affected_rows: 0 } }, // update hit nothing
    { status: 200, body: { rows: [], affected_rows: 0 } }, // refetch: row truly gone
  ]);
  await publisher.drain();
  publisher.stop();
  assert.equal(sent[1].body.op, "get"); // authoritative refetch
  assert.equal(queue.size(), 0);
  assert.deepEqual(events.map((event) => event.type), ["page-deleted"]);
});

test("409 conflict: entry dropped + refetched server row snaps the UI back", async () => {
  const { queue, publisher, events } = makePublisher(PG_SCHEMA);
  queue.enqueueCell("orders", "1", { qty: 99 });
  const sent = mockFetch([
    { status: 409, body: { message: "constraint" } }, // txn batch rolled back
    { status: 200, body: { rows: [{ id: 1, name: "Server", qty: 7 }], affected_rows: 1 } },
  ]);
  await publisher.drain();
  publisher.stop();
  assert.equal(sent[1].body.op, "get");
  assert.equal(queue.size(), 0);
  const changed = events[0] as { type: string; pageId: string; changes: Record<string, unknown> };
  assert.equal(changed.type, "page-changed");
  assert.equal(changed.pageId, "baas:db-1:orders:1");
  assert.equal(changed.changes.qty, 7); // server truth re-applied
});

test("5xx keeps the entry and backs off exponentially", async () => {
  const { queue, publisher } = makePublisher(PG_SCHEMA);
  queue.enqueueCell("orders", "1", { qty: 3 });
  mockFetch([{ status: 500, body: { message: "boom" } }, { status: 502, body: {} }]);
  await publisher.drain();
  assert.equal(queue.size(), 1); // kept for retry
  assert.equal(publisher.retryDelayMs, LIVE_BACKOFF_MIN_MS * 2);
  await publisher.drain(); // second transient failure doubles again
  assert.equal(queue.size(), 1);
  assert.equal(publisher.retryDelayMs, LIVE_BACKOFF_MIN_MS * 4);
  publisher.stop(); // clear the scheduled retry timer
});

test("cell give-up after max attempts resets ONLY its row, never whole-mount state-replaced", async () => {
  const { queue, publisher, events } = makePublisher(PG_SCHEMA);
  queue.enqueueCell("orders", "1", { qty: 3 });
  // 8 transient txn failures burn the entry's attempts; the give-up then does a
  // row-scoped authoritative refetch (op=get) instead of reloading the mount.
  const responses: { status: number; body: unknown }[] = [];
  for (let i = 0; i < 8; i++) responses.push({ status: 500, body: { message: "boom" } });
  responses.push({ status: 200, body: { rows: [{ id: 1, name: "Server", qty: 7 }], affected_rows: 1 } });
  const sent = mockFetch(responses);
  for (let i = 0; i < 8; i++) await publisher.drain();
  publisher.stop();
  assert.equal(queue.size(), 0); // burned out + dropped
  assert.equal(sent[sent.length - 1].body.op, "get"); // row-scoped refetch, not a mount reload
  assert.deepEqual(sent[sent.length - 1].body.filter, { id: 1 });
  const types = events.map((event) => event.type);
  assert.ok(!types.includes("state-replaced"), "give-up must not whole-mount reload (would wipe other unsaved edits)");
  assert.deepEqual(types, ["page-changed"]); // only the failed row snaps to server truth
  assert.equal((events[0] as { changes: Record<string, unknown> }).changes.qty, 7);
});

test("insert uses the echoed row: temp page swaps to the real pk, no reload", async () => {
  const { queue, publisher, events } = makePublisher(PG_SCHEMA);
  queue.enqueue({ kind: "insert", table: "orders", values: { name: "New", qty: 2 }, tempId: "temp-1" });
  const id = queue.pending()[0].id;
  const sent = mockFetch([
    { status: 200, body: { rows: [{ id: 7, name: "New", qty: 2, status: null }], affected_rows: 1 } },
  ]);
  await publisher.drain();
  publisher.stop();
  assert.equal(sent[0].body.op, "insert");
  assert.equal(sent[0].body.idempotencyKey, id);
  assert.deepEqual(sent[0].body.data, { name: "New", qty: 2 });
  assert.equal(queue.size(), 0);
  const [gone, inserted] = events as [{ type: string; pageId: string }, { type: string; page: { id: string } }];
  assert.deepEqual([gone.type, gone.pageId], ["page-deleted", "temp-1"]);
  assert.deepEqual([inserted.type, inserted.page.id], ["page-inserted", "baas:db-1:orders:7"]);
});

test("delete sends op=delete with the typed pk filter", async () => {
  const { queue, publisher } = makePublisher(PG_SCHEMA);
  queue.enqueue({ kind: "delete", table: "orders", pk: "5" });
  const sent = mockFetch([{ status: 200, body: { rows: [], affected_rows: 1 } }]);
  await publisher.drain();
  publisher.stop();
  assert.equal(sent[0].body.op, "delete");
  assert.deepEqual(sent[0].body.filter, { id: 5 }); // numeric pk coerced
  assert.equal(queue.size(), 0);
});

test("ddl success busts the schema cache and reloads state", async () => {
  const storage = new Map<string, string>();
  const queue = new LiveWriteQueue("baas:db-1:orders", {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value); },
  });
  const events: { type: string }[] = [];
  let busted = 0;
  const publisher = new LiveWritePublisher({
    mount: { dbId: "db-1", table: "orders" },
    queue,
    getSchema: async () => PG_SCHEMA,
    emit: (event) => events.push(event),
    onSchemaChanged: () => { busted += 1; },
  });
  queue.enqueue({ kind: "ddl", table: "orders", request: { op: "add_column", table: "orders", column: { name: "note", normalized_type: "text", nullable: true } } });
  const sent = mockFetch([{ status: 201, body: {} }]);
  await publisher.drain();
  publisher.stop();
  assert.match(sent[0].url, /\/api\/databases\/db-1\/schema\/ddl$/);
  assert.equal(queue.size(), 0);
  assert.equal(busted, 1);
  assert.deepEqual(events.map((event) => event.type), ["state-replaced"]);
});

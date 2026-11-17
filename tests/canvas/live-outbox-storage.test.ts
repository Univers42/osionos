/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-outbox-storage.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ADR 0056 A5 on the live databases' outbox: edits the server has not confirmed are user
// content whose only copy is the browser's. A refused write makes room from the page caches,
// one still refused is kept in memory (and still sent) and shown once, and the outbox is never
// what another store's room-making write evicts.

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { PG_ROWS, PG_SCHEMA, mockFetch } from "./live-adapter-fixtures.ts";
import { QuotaStorage } from "./quota-storage.ts";
import "./window-events.ts";

const storage = new QuotaStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: storage });
Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: globalThis });
Object.defineProperty(globalThis, "location", { configurable: true, writable: true, value: new URL("http://localhost/") });

const { liveOutboxStorage } = await import("../../src/widgets/database-view/model/liveOutboxStorage.ts");
const { LiveAdapterWrites } = await import("../../src/shared/notion-database-sys/src/store/live/liveAdapterWrites.ts");
const { LIVE_WRITE_OUTBOX_KEY, LiveWriteQueue } = await import("../../src/shared/notion-database-sys/src/store/live/liveWriteQueue.ts");
const { buildLiveState } = await import("../../src/shared/notion-database-sys/src/store/live/liveStateBuilder.ts");
const { setItemEvictingPageCaches } = await import("../../src/store/pageStore.helpers.ts");
const { getLiveDatabaseAdapter } = await import("../../src/widgets/database-view/model/liveDatabaseAdapter.ts");
const { useToastStore } = await import("@osionos/ui/primitives/useToastStore");

const DB_ID = "baas:pg-commerce:orders";
const PAGE_CACHE = "osio:pages:ws-1";
const tick = (ms = 700) => new Promise((resolve) => setTimeout(resolve, ms));
const noticed = () => useToastStore.getState().toasts
  .filter((toast) => toast.title === "Browser storage is full")
  .map((toast) => toast.description?.split(":")[0]);

beforeEach(() => {
  storage.clear();
  storage.setItem(PAGE_CACHE, JSON.stringify({ pages: ["cached"] }));
});

test("a refused outbox write evicts the page cache and is then kept, in today's format", () => {
  storage.fullWhilePageCached.add(LIVE_WRITE_OUTBOX_KEY);
  const queue = new LiveWriteQueue(DB_ID, liveOutboxStorage);
  queue.enqueueCell("orders", "1234", { status: "confirmed" });
  assert.equal(storage.getItem(PAGE_CACHE), null);
  assert.equal(storage.getItem(LIVE_WRITE_OUTBOX_KEY), JSON.stringify(queue.pending()));
  assert.deepEqual(Object.keys(queue.pending()[0]).sort(), ["data", "databaseId", "id", "kind", "pk", "table"]);
  assert.deepEqual(noticed(), []);
});

test("refused even after room was made: the edits stay queued, are sent, and are noticed once", async () => {
  storage.refused.add(LIVE_WRITE_OUTBOX_KEY);
  const writes = new LiveAdapterWrites(DB_ID, { getSchema: async () => PG_SCHEMA, emit: () => {}, storage: liveOutboxStorage });
  const prev = buildLiveState(PG_SCHEMA, { dbId: "pg-commerce", table: "orders" }, { orders: PG_ROWS });
  writes.noteLoadedPages(prev.pages);
  const first = structuredClone(prev);
  first.pages[`${DB_ID}:1234`].properties.status = "confirmed";
  const second = structuredClone(first);
  second.pages[`${DB_ID}:1235`].properties.status = "pending";
  const sent = mockFetch([]);
  assert.doesNotThrow(() => { writes.persist(first, prev); writes.persist(second, first); });
  assert.equal(writes.pendingWrites(), 2);
  assert.equal(storage.getItem(LIVE_WRITE_OUTBOX_KEY), null);
  assert.deepEqual(noticed(), ["Unsent database edits"]);
  // The queue's save() catches a throw; the storage itself must not need it to.
  assert.equal(liveOutboxStorage.setItem(LIVE_WRITE_OUTBOX_KEY, "[]"), undefined);
  await tick();
  writes.stop();
  assert.match(JSON.stringify(sent), /"confirmed".*"pending"|"pending".*"confirmed"/);
  assert.equal(writes.pendingWrites(), 0);
});

test("an outbox stored by an earlier session is read back from localStorage", () => {
  const earlier = new LiveWriteQueue(DB_ID, liveOutboxStorage);
  earlier.enqueueCell("orders", "1234", { status: "confirmed" });
  assert.deepEqual(new LiveWriteQueue(DB_ID, liveOutboxStorage).pending(), earlier.pending());
});

test("the outbox survives another store's room-making write byte for byte", () => {
  const queue = new LiveWriteQueue(DB_ID, liveOutboxStorage);
  queue.enqueueCell("orders", "1234", { status: "confirmed" });
  const outbox = storage.getItem(LIVE_WRITE_OUTBOX_KEY);
  assert.notEqual(outbox, null);
  storage.fullWhilePageCached.add("osio:other-content");
  assert.equal(setItemEvictingPageCaches("osio:other-content", "kept"), true);
  assert.equal(storage.getItem(PAGE_CACHE), null);
  assert.equal(storage.getItem(LIVE_WRITE_OUTBOX_KEY), outbox);
});

test("the live database adapter keeps its outbox through the room-making writer", () => {
  storage.fullWhilePageCached.add(LIVE_WRITE_OUTBOX_KEY);
  const adapter = getLiveDatabaseAdapter(DB_ID) as unknown as {
    persistState(next: unknown, prev: unknown): void; writes: { stop(): void };
  };
  const prev = buildLiveState(PG_SCHEMA, { dbId: "pg-commerce", table: "orders" }, { orders: PG_ROWS });
  const next = structuredClone(prev);
  next.pages[`${DB_ID}:1234`].properties.status = "confirmed";
  adapter.persistState(next, prev);
  adapter.writes.stop();
  assert.equal(storage.getItem(PAGE_CACHE), null);
  assert.equal(JSON.parse(storage.getItem(LIVE_WRITE_OUTBOX_KEY) ?? "[]")[0]?.data?.status, "confirmed");
});

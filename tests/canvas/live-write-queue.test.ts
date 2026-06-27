/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-write-queue.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LIVE_WRITE_OUTBOX_KEY,
  LiveWriteQueue,
  type LiveQueueStorage,
} from "../../src/shared/notion-database-sys/src/store/live/liveWriteQueue.ts";

const DB_A = "baas:db-1:orders";
const DB_B = "baas:db-1:customers";

function storageStub(): LiveQueueStorage & { dump(): string | null } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    dump: () => map.get(LIVE_WRITE_OUTBOX_KEY) ?? null,
  };
}

test("cell changes coalesce per row: later values replace, columns merge", () => {
  const queue = new LiveWriteQueue(DB_A, storageStub());
  queue.enqueueCell("orders", "1", { qty: 2 });
  queue.enqueueCell("orders", "1", { qty: 5 }); // later value replaces
  queue.enqueueCell("orders", "1", { status: "paid" }); // new column merges
  queue.enqueueCell("orders", "2", { qty: 9 }); // different row = new entry
  const pending = queue.pending();
  assert.equal(pending.length, 2);
  assert.equal(pending[0].kind, "cell");
  assert.deepEqual((pending[0] as { data: unknown }).data, { qty: 5, status: "paid" });
  assert.deepEqual((pending[1] as { data: unknown }).data, { qty: 9 });
});

test("coalescing keeps the entry's queue position; non-cell ops stay FIFO", () => {
  const queue = new LiveWriteQueue(DB_A, storageStub());
  queue.enqueueCell("orders", "1", { qty: 1 });
  queue.enqueue({ kind: "insert", table: "orders", values: { name: "n" }, tempId: "t1" });
  queue.enqueue({ kind: "delete", table: "orders", pk: "9" });
  queue.enqueue({ kind: "ddl", table: "orders", request: { op: "add_column" } });
  queue.enqueueCell("orders", "1", { qty: 7 }); // merges into slot 0, not the tail
  assert.deepEqual(queue.pending().map((entry) => entry.kind), ["cell", "insert", "delete", "ddl"]);
  assert.deepEqual((queue.pending()[0] as { data: unknown }).data, { qty: 7 });
});

test("ledger round-trip: a new instance adopts this database's pending entries", () => {
  const storage = storageStub();
  const queue = new LiveWriteQueue(DB_A, storage);
  queue.enqueueCell("orders", "1", { qty: 2 });
  queue.enqueue({ kind: "delete", table: "orders", pk: "3" });

  const reloaded = new LiveWriteQueue(DB_A, storage); // simulates a page reload
  assert.equal(reloaded.size(), 2);
  assert.deepEqual(reloaded.pending().map((entry) => entry.kind), ["cell", "delete"]);
});

test("mounts share the key but never each other's entries", () => {
  const storage = storageStub();
  const queueA = new LiveWriteQueue(DB_A, storage);
  const queueB = new LiveWriteQueue(DB_B, storage);
  queueA.enqueueCell("orders", "1", { qty: 2 });
  queueB.enqueueCell("customers", "c-1", { name: "Ada" });
  assert.equal(new LiveWriteQueue(DB_A, storage).size(), 1);
  assert.equal(new LiveWriteQueue(DB_B, storage).size(), 1);
  // B saving must not clobber A's persisted slice
  queueB.enqueue({ kind: "delete", table: "customers", pk: "c-2" });
  assert.equal(new LiveWriteQueue(DB_A, storage).size(), 1);
});

test("remove() drops confirmed entries and persists the remainder", () => {
  const storage = storageStub();
  const queue = new LiveWriteQueue(DB_A, storage);
  queue.enqueueCell("orders", "1", { qty: 2 });
  queue.enqueue({ kind: "delete", table: "orders", pk: "3" });
  const [first] = queue.pending();
  queue.remove([first.id]);
  assert.equal(queue.size(), 1);
  assert.equal(new LiveWriteQueue(DB_A, storage).size(), 1); // persisted too
});

test("an unreadable ledger starts clean instead of crashing", () => {
  const storage = storageStub();
  storage.setItem(LIVE_WRITE_OUTBOX_KEY, "{corrupt json!");
  const queue = new LiveWriteQueue(DB_A, storage);
  assert.equal(queue.size(), 0);
  queue.enqueueCell("orders", "1", { qty: 2 }); // and keeps working
  assert.equal(queue.size(), 1);
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-mount-adapter-storage.test.ts                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The storage a LiveMountAdapter is given is the one its outbox reads at construction and
// writes on every edit; without one, the outbox keeps using globalThis.localStorage.

import assert from "node:assert/strict";
import { test } from "node:test";

import { PG_ROWS, PG_SCHEMA } from "./live-adapter-fixtures.ts";
import { LiveMountAdapter } from "../../src/shared/notion-database-sys/src/store/live/liveMountAdapter.ts";
import { buildLiveState } from "../../src/shared/notion-database-sys/src/store/live/liveStateBuilder.ts";
import { LIVE_WRITE_OUTBOX_KEY } from "../../src/shared/notion-database-sys/src/store/live/liveWriteQueue.ts";

const DB_ID = "baas:pg-commerce:orders";
const ROW = "baas:pg-commerce:orders:1234";

class RecordingStorage {
  readonly data = new Map<string, string>();
  readonly reads: string[] = [];
  getItem(key: string) { this.reads.push(key); return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

function editOneCell(adapter: LiveMountAdapter): void {
  const prev = buildLiveState(PG_SCHEMA, { dbId: "pg-commerce", table: "orders" }, { orders: PG_ROWS });
  const next = structuredClone(prev);
  next.pages[ROW].properties.status = "confirmed";
  adapter.persistState(next, prev);
  // The drain is debounced; stop it before it fetches.
  (adapter as unknown as { writes: { stop(): void } }).writes.stop();
}

test("an injected storage is read at construction and receives the outbox writes", () => {
  const global = new RecordingStorage();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: global });
  const injected = new RecordingStorage();
  const adapter = new LiveMountAdapter(DB_ID, injected);
  assert.deepEqual(injected.reads, [LIVE_WRITE_OUTBOX_KEY]);
  editOneCell(adapter);
  const outbox = JSON.parse(injected.data.get(LIVE_WRITE_OUTBOX_KEY) ?? "[]");
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].databaseId, DB_ID);
  assert.deepEqual([global.reads, [...global.data.keys()]], [[], []]);
});

test("without a storage, the outbox reads and writes globalThis.localStorage", () => {
  const global = new RecordingStorage();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: global });
  const adapter = new LiveMountAdapter(DB_ID);
  assert.deepEqual(global.reads, [LIVE_WRITE_OUTBOX_KEY]);
  editOneCell(adapter);
  assert.equal(JSON.parse(global.data.get(LIVE_WRITE_OUTBOX_KEY) ?? "[]").length, 1);
});

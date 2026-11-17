/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   known-database-legacy-retirement.test.ts           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The devil's N1 (ADR 0054, C2): on a full origin the migration's flag write threw, the legacy
// keys stayed unflagged, and a later load whose IndexedDB failed read that frozen pair and pushed
// it over a newer server copy. The flag now makes room in the page caches; the legacy keys go only
// once the flag reads back, and stay when it still does not fit.

import assert from "node:assert/strict";
import test from "node:test";

await import("./support/memory-local-storage.ts");
await import("./support/stub-bridge.ts");
await import("./support/kds-browser.ts");

const kds = await import("./support/kds-tab.ts");
const { KDS_IDB_FLAG_KEY, openDurableCopy } = await import("../../src/widgets/database-view/model/knownDatabaseDurableCopy.ts");
const { resetObjectDatabaseSync } = await import("../../src/widgets/database-view/model/objectDatabaseBridgeSync.ts");
const { serializeKnownDatabaseState } = await import("../../src/widgets/database-view/model/knownDatabasePersistedState.ts");
const { createMemoryKeyValueStore } = await import("./support/memory-key-value-store.ts");
const { EMPTY, X_NEW, withDb, sliceOf, hashOf, valuesOf, settle } = kds;
type MemoryStore = ReturnType<typeof createMemoryKeyValueStore>;

const STATE_KEY = "osionos.knownDatabaseState.v1";
const PUSHED_KEY = "osionos.objectDb.pushed.v1";
const PAGE_CACHE_KEY = "osio:pages:ws-1";

// A full origin: every setItem throws while a page cache is stored. `refusesEverything` is an
// origin with nothing left to evict.
function fullOrigin(initial: Record<string, string>, refusesEverything = false) {
  const values = new Map(Object.entries({ ...initial, [PAGE_CACHE_KEY]: "[]" }));
  const isFull = () => refusesEverything || values.has(PAGE_CACHE_KEY);
  return {
    values,
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (isFull()) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      values.set(key, value);
    },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const LEGACY = { [STATE_KEY]: "legacy-text", [PUSHED_KEY]: JSON.stringify({ a: "h1" }) };

test("a full origin: the flag write evicts the page caches, is stored, then the legacy keys go", async () => {
  const legacy = fullOrigin(LEGACY);
  const loaded = await openDurableCopy({ openStore: async () => createMemoryKeyValueStore(), legacy, tabId: "tabA" }).ready;
  assert.equal(loaded.mode, "idb");
  assert.equal(legacy.values.get(KDS_IDB_FLAG_KEY), "1");
  assert.equal(legacy.values.has(STATE_KEY) || legacy.values.has(PUSHED_KEY), false, "both legacy keys are gone");
  assert.equal(legacy.values.has(PAGE_CACHE_KEY), false, "the page cache made the room");
});

test("an origin that refuses every write keeps both legacy keys and no flag", async () => {
  const legacy = fullOrigin(LEGACY, true);
  const store = createMemoryKeyValueStore();
  const loaded = await openDurableCopy({ openStore: async () => store, legacy, tabId: "tabA" }).ready;
  assert.equal(loaded.mode, "idb");
  assert.equal(legacy.values.has(KDS_IDB_FLAG_KEY), false, "no retirement is claimed");
  assert.equal(legacy.values.get(STATE_KEY), "legacy-text");
  assert.equal(legacy.values.get(PUSHED_KEY), LEGACY[PUSHED_KEY]);
});

async function reloadWithoutIndexedDb(store: MemoryStore, legacy: ReturnType<typeof fullOrigin>) {
  resetObjectDatabaseSync();
  const copy = createMemoryKeyValueStore(Object.fromEntries(store.entries));
  const tab = kds.openTab(copy, { tabId: "tab-reloaded", legacy, isUnavailable: true });
  await tab.persistence.ready;
  await tab.hydrate();
  await settle(60);
  return tab;
}

// Ported from the devil's harness (devil-p1-2b.test.ts, N1). The origin is full of page caches,
// as the live one is; the cure lands the second load in fallback-flagged (pull only), where the
// attack needed fallback-legacy.
test("N1: a full origin still flags the migration, so a later IndexedDB failure pushes nothing", async (t) => {
  const local = withDb(EMPTY, "db-x", ["x-local-1", "x-local-2"]);
  const previous = withDb(EMPTY, "db-x", ["x-prev-1", "x-prev-2"]);
  const legacy = fullOrigin({
    [STATE_KEY]: serializeKnownDatabaseState(local, new Set()),
    [PUSHED_KEY]: JSON.stringify({ "db-x": hashOf(previous, "db-x") }),
  });
  const bridge = kds.useBridge(t, { "db-x": sliceOf(previous, "db-x") });
  const store = createMemoryKeyValueStore();
  const first = kds.openTab(store, { legacy });
  await first.persistence.ready;
  assert.equal(first.persistence.mode(), "idb");
  await first.hydrate();
  await settle(40); // the offline edit x-local reaches the server
  assert.equal(legacy.values.get(KDS_IDB_FLAG_KEY), "1");
  assert.equal(legacy.values.has(STATE_KEY), false);
  bridge.server.set("db-x", withDb(EMPTY, "db-x", X_NEW)); // another device edits db-x
  bridge.posts = [];
  const second = await reloadWithoutIndexedDb(store, legacy);
  assert.equal(second.persistence.mode(), "fallback-flagged");
  assert.deepEqual(kds.postedValues(bridge, "db-x"), [], "N1: the frozen legacy pair pushed db-x");
  assert.deepEqual(valuesOf(bridge.server.get("db-x"), "db-x"), X_NEW);
});

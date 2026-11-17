// The ids the unload journal may land on (groot ADR 0055 J-C1, JM2): the id read at readiness, the
// last commit this tab resolved, and every commit still pending. Ids are assigned when a commit starts,
// so a commit an unload abandons is already listed.

import assert from "node:assert/strict";
import test from "node:test";

import { openDurableCopy, type DurableCopy } from "../../src/widgets/database-view/model/knownDatabaseDurableCopy.ts";
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from "./support/memory-key-value-store.ts";
import { createUnloadJournalWriter, journalKey } from "../../src/widgets/database-view/model/knownDatabaseJournal.ts";

const noLegacy = { length: 0, key: () => null, getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

function open(store: MemoryKeyValueStore, tabId = "tabA"): DurableCopy {
  return openDurableCopy({ openStore: async () => store, legacy: noLegacy, tabId, budgetMs: 500 });
}

const earlier = () => createMemoryKeyValueStore({ state: { text: "{}", id: "earlier:1" }, pushed: { map: { a: "h0" }, stateId: "earlier:1" } });

test("ledger: before any commit it names only the id read at readiness", async () => {
  const copy = open(earlier());
  await copy.ready;
  assert.deepEqual(copy.ledger(), { loadedId: "earlier:1", lastResolved: null, pending: [] });
});

test("ledger: an empty store loads no id", async () => {
  const copy = open(createMemoryKeyValueStore());
  await copy.ready;
  assert.equal(copy.ledger().loadedId, null);
});

test("ledger: a commit is pending from the moment it starts, with the state and record it captured", async () => {
  const store = earlier();
  const copy = open(store);
  await copy.ready;
  store.delayMs = 20;
  const ref = {};
  const committed = copy.commit(ref, "text", { a: "h1" });
  assert.deepEqual(copy.ledger().pending, [{ id: "tabA:1", stateRef: ref, record: { a: "h1" } }]);
  assert.equal(copy.ledger().pending[0]?.stateRef, ref);
  assert.equal(await committed, true);
  assert.deepEqual(copy.ledger().pending, []);
  assert.equal(copy.ledger().lastResolved?.id, "tabA:1");
  assert.equal(copy.ledger().lastResolved?.stateRef, ref);
});

test("ledger: a failed commit leaves the pending list and is never resolved", async () => {
  const store = earlier();
  const copy = open(store);
  await copy.ready;
  await copy.commit({}, "one", {});
  store.failWrites = true;
  assert.equal(await copy.commit({}, "two", {}), false);
  assert.equal(copy.ledger().lastResolved?.id, "tabA:1");
  assert.deepEqual(copy.ledger().pending, []);
});

test("ledger: a stored record catch-up moves the last resolved commit's record", async () => {
  const copy = open(earlier());
  await copy.ready;
  const ref = {};
  await copy.commit(ref, "text", { a: "h1" });
  assert.equal(await copy.commitRecord(ref, { a: "h2" }), true);
  assert.deepEqual(copy.ledger().lastResolved?.record, { a: "h2" });
});

test("ledger: a refused catch-up leaves the record as committed", async () => {
  const copy = open(earlier());
  await copy.ready;
  await copy.commit({}, "text", { a: "h1" });
  assert.equal(await copy.commitRecord({}, { a: "h2" }), false);
  assert.deepEqual(copy.ledger().lastResolved?.record, { a: "h1" });
});

test("ledger: a migration loads the migrated id", async () => {
  const legacy = { ...noLegacy, getItem: (key: string) => (key === "osionos.knownDatabaseState.v1" ? "{}" : null) };
  const copy = openDurableCopy({ openStore: async () => createMemoryKeyValueStore(), legacy, tabId: "tabA", budgetMs: 500 });
  await copy.ready;
  assert.equal(copy.ledger().loadedId, "migrated:tabA");
});

test("ledger: a copy an older build migrated under the bare id is redone under this tab's id", async () => {
  const store = createMemoryKeyValueStore({ state: { text: "stored-text", id: "migrated" }, pushed: { map: { b: "h2" }, stateId: "migrated" } });
  const legacy = { ...noLegacy, getItem: (key: string) => (key === "osionos.knownDatabaseState.v1" ? "legacy-text" : null) };
  const copy = openDurableCopy({ openStore: async () => store, legacy, tabId: "tabA", budgetMs: 500 });
  assert.equal((await copy.ready).text, "legacy-text");
  assert.deepEqual(store.entries.get("state"), { text: "legacy-text", id: "migrated:tabA" });
  assert.equal(copy.ledger().loadedId, "migrated:tabA");
});

function mapStorage() {
  const values = new Map<string, string>();
  return {
    values,
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

// JM2: an older resolved commit can never be stored again, and one id per commit grows past the
// 1,000,000-character cap in a long session (3600 ids = 114,094 characters, measured).
test("ledger: after 1000 resolved commits the journal names the loaded id, the last resolved one and the pending ones", async () => {
  const copy = open(earlier());
  await copy.ready;
  const committed = { databases: {}, pages: {}, views: {} };
  for (let seq = 1; seq <= 1000; seq += 1) await copy.commit(committed, "text", {});
  const pending = copy.commit(committed, "text", {});
  const storage = mapStorage();
  const live = { databases: { "db-x": { id: "db-x" } }, pages: {}, views: {} } as unknown as typeof committed;
  const writer = createUnloadJournalWriter({
    storage, tabId: "tabA", ledger: () => copy.ledger(), loadedBase: () => null, live: () => live,
    record: () => ({ version: 0, snapshot: () => ({}) }),
  });
  assert.equal(writer.write(), true);
  const { bases } = JSON.parse(storage.values.get(journalKey("tabA")) ?? "{}") as { bases: string[] };
  assert.ok(bases.length <= 2 + copy.ledger().pending.length, `${bases.length} bases`);
  assert.deepEqual(bases, ["earlier:1", "tabA:1000", "tabA:1001"]);
  await pending;
});

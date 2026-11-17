// The ids the unload journal may land on (groot ADR 0055 J-C1): the id read at readiness, every
// commit this tab resolved, and every commit still pending. Ids are assigned when a commit starts,
// so a commit an unload abandons is already listed.

import assert from "node:assert/strict";
import test from "node:test";

import { openDurableCopy, type DurableCopy } from "../../src/widgets/database-view/model/knownDatabaseDurableCopy.ts";
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from "./support/memory-key-value-store.ts";

const noLegacy = { length: 0, key: () => null, getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

function open(store: MemoryKeyValueStore, tabId = "tabA"): DurableCopy {
  return openDurableCopy({ openStore: async () => store, legacy: noLegacy, tabId, budgetMs: 500 });
}

const earlier = () => createMemoryKeyValueStore({ state: { text: "{}", id: "earlier:1" }, pushed: { map: { a: "h0" }, stateId: "earlier:1" } });

test("ledger: before any commit it names only the id read at readiness", async () => {
  const copy = open(earlier());
  await copy.ready;
  assert.deepEqual(copy.ledger(), { loadedId: "earlier:1", resolvedIds: [], lastResolved: null, pending: [] });
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
  assert.deepEqual(copy.ledger().resolvedIds, ["tabA:1"]);
  assert.equal(copy.ledger().lastResolved?.stateRef, ref);
});

test("ledger: a failed commit leaves the pending list and is never resolved", async () => {
  const store = earlier();
  const copy = open(store);
  await copy.ready;
  await copy.commit({}, "one", {});
  store.failWrites = true;
  assert.equal(await copy.commit({}, "two", {}), false);
  assert.deepEqual(copy.ledger().resolvedIds, ["tabA:1"]);
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

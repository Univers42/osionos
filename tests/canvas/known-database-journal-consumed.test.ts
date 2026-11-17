// A journal another tab's readiness already applied (groot ADR 0055 re-rule on 2caf348fb, D4 and
// D4b): its writer is still alive, and anything it writes at pagehide names only ids the store no
// longer holds, so it never lands over the consumer's newer copy, and a slice applied twice is the
// same slice.

import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

await import("./support/memory-local-storage.ts");
await import("./support/stub-bridge.ts");
await import("./support/kds-browser.ts");

const kds = await import("./support/kds-tab.ts");
const { createMemoryKeyValueStore } = await import("./support/memory-key-value-store.ts");
const { resetObjectDatabaseSync } = await import("../../src/widgets/database-view/model/objectDatabaseBridgeSync.ts");
const { EMPTY, withDb, sliceOf, hashOf, valuesOf, settle, storeWith, storedPair, memoryLegacy, openTab, reload, useBridge } = kds;

const X = withDb(EMPTY, "db-x", ["a", "b"]);
const KEY_A = "osionos.kds.journal.v1.tab-a";

// Tab A leaves an offline edit b-1 in its journal at hidden (its commit is lost); tab B opens and
// applies that journal.
async function consumedByB(t: TestContext) {
  const bridge = useBridge(t, { "db-x": sliceOf(X, "db-x") });
  const store = storeWith(X, { "db-x": hashOf(X, "db-x") });
  const legacy = memoryLegacy();
  const a = openTab(store, { legacy });
  await a.persistence.ready; await a.hydrate(); await settle();
  bridge.failPosts = true;
  a.edit("db-x", ["a", "b-1"]);
  store.failWrites = true; a.hide(); await settle(); store.failWrites = false;
  assert.ok(legacy.values.has(KEY_A));
  const b = openTab(store, { legacy, tabId: "tab-b" }); await b.persistence.ready;
  assert.equal(legacy.values.has(KEY_A), false, "B applied and removed A's journal");
  assert.match(storedPair(store).id, /^tab-b:/);
  return { bridge, store, legacy, a, b };
}

test("D4: a consumed journal its tab writes again at pagehide never lands over the consumer's newer copy", async (t) => {
  const { bridge, store, legacy, a, b } = await consumedByB(t);
  bridge.failPosts = false;
  b.edit("db-x", ["a", "b-B2"]); b.flush(); await settle(80);
  assert.equal(storedPair(store).id, "tab-b:2");
  bridge.failPosts = true; store.failWrites = true; a.pagehide(); await settle(); // A's push and commit lost
  bridge.failPosts = false; store.failWrites = false;
  resetObjectDatabaseSync();
  const reloaded = openTab(createMemoryKeyValueStore(Object.fromEntries(store.entries)), { tabId: "tab-reloaded", legacy });
  await reloaded.persistence.ready;
  assert.deepEqual(valuesOf(reloaded.live.state, "db-x"), ["a", "b-B2"], "D4: A's journal landed over B's newer copy");
  assert.equal(legacy.values.has(KEY_A), false, "D4: a journal naming no stored id stays behind");
});

test("D4b: A commits again over the consumer's copy and leaves → its edit reaches the server once", async (t) => {
  const { bridge, store, legacy, a } = await consumedByB(t);
  a.flush(); await settle(); // A, hidden but alive, commits b-1 over tab-b:1
  store.failWrites = true; a.pagehide(); await settle(); store.failWrites = false;
  bridge.failPosts = false;
  await reload(store, legacy);
  assert.deepEqual(valuesOf(bridge.server.get("db-x"), "db-x"), ["a", "b-1"]);
});

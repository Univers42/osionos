// The devil's J sequences T1-T8 (groot ADR 0055, scratch devil-j-ack.test.ts) on the real journal
// writer and the real readiness apply: an IndexedDB commit started at unload is lost (I10) while
// the push it races lands, and the reload must neither revert that push nor lose the edit.
// T1 is devil-p1-2b.test.ts:205 (N2), driven through the real writer (J-C8).

import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

await import("./support/memory-local-storage.ts");
await import("./support/stub-bridge.ts");
await import("./support/kds-browser.ts");

const kds = await import("./support/kds-tab.ts");
const { createMemoryKeyValueStore } = await import("./support/memory-key-value-store.ts");
const { resetObjectDatabaseSync } = await import("../../src/widgets/database-view/model/objectDatabaseBridgeSync.ts");
const { serializeKnownDatabaseState } = await import("../../src/widgets/database-view/model/knownDatabasePersistedState.ts");
const { openDurableCopy } = await import("../../src/widgets/database-view/model/knownDatabaseDurableCopy.ts");
const { EMPTY, withDb, sliceOf, hashOf, valuesOf, settle, storeWith, storedPair, memoryLegacy, openTab, reload, useBridge } = kds;

type State = typeof EMPTY;
const X = withDb(EMPTY, "db-x", ["a", "b"]);
const XY = withDb(X, "db-y", ["y-1"]);

async function freshTab(t: TestContext, base: State) {
  const keys = Object.keys(base.databases);
  const bridge = useBridge(t, Object.fromEntries(keys.map((key) => [key, sliceOf(base, key)])));
  const store = storeWith(base, Object.fromEntries(keys.map((key) => [key, hashOf(base, key)])));
  const legacy = memoryLegacy();
  const tab = openTab(store, { legacy });
  await tab.persistence.ready;
  await tab.hydrate();
  await settle();
  return { bridge, store, legacy, tab };
}

const serverValues = (bridge: ReturnType<typeof useBridge>, key: string) => valuesOf(bridge.server.get(key), key);

test("T1 (N2): the pagehide push lands and its commit is lost → the journal keeps b-2 on the server", async (t) => {
  const { bridge, store, legacy, tab } = await freshTab(t, X);
  const release = bridge.hold();
  tab.edit("db-x", ["a", "b-1"]); tab.flush(); await settle(); // committed, push held → stored x is dirty
  tab.edit("db-x", ["a", "b-2"]);
  release(); await settle(); // b-1 pushed; catch-up refused (live b-2 ≠ committed b-1)
  store.failWrites = true; tab.flush(true); await settle(); // pagehide: commit lost, push lands
  assert.deepEqual(serverValues(bridge, "db-x"), ["a", "b-2"]);
  await reload(store, legacy);
  assert.deepEqual(serverValues(bridge, "db-x"), ["a", "b-2"], "N2: own newer edit reverted on the server");
});

test("T2: a commit in flight at pagehide lands, the pagehide one is lost → b-2 stays", async (t) => {
  const { bridge, store, legacy, tab } = await freshTab(t, X);
  store.delayMs = 50;
  tab.edit("db-x", ["a", "b-1"]); tab.flush(); // C1 in flight
  tab.edit("db-x", ["a", "b-2"]);
  tab.pagehide(); // C2 queued behind C1, b-2 pushed now
  await settle(70); store.failWrites = true; await settle(150); // C1 landed, C2 lost
  assert.equal(storedPair(store).id, "tab-a:1");
  await reload(store, legacy);
  assert.deepEqual(serverValues(bridge, "db-x"), ["a", "b-2"], "T2: own newer edit reverted");
});

test("T3: an undo while a commit is in flight stays undone", async (t) => {
  const { bridge, store, legacy, tab } = await freshTab(t, X);
  store.delayMs = 50;
  tab.edit("db-x", ["a", "b-1"]); tab.flush();
  tab.edit("db-x", ["a", "b"]);
  tab.pagehide();
  await settle(70); store.failWrites = true; await settle(150);
  await reload(store, legacy);
  assert.deepEqual(serverValues(bridge, "db-x"), ["a", "b"], "T3: undone edit resurrected");
});

test("T4: a record that moved without its slice keeps another device's edit", async (t) => {
  const { bridge, store, legacy, tab } = await freshTab(t, XY);
  const release = bridge.hold();
  tab.edit("db-y", ["y-2"]); tab.flush(); await settle(); // committed with record y-1; push of y-2 held
  tab.edit("db-x", ["a", "b-1"]); // live ≠ committed → the coming catch-up is refused
  release(); await settle();
  bridge.server.set("db-y", withDb(EMPTY, "db-y", ["y-OTHER"])); // another device
  store.failWrites = true; tab.pagehide(); await settle();
  await reload(store, legacy);
  assert.deepEqual(serverValues(bridge, "db-x"), ["a", "b-1"]);
  assert.deepEqual(serverValues(bridge, "db-y"), ["y-OTHER"], "T4: another device's edit reverted");
});

test("T5: no commit this session, offline at pagehide → the edit reaches the server after the reload", async (t) => {
  const { bridge, store, legacy, tab } = await freshTab(t, X);
  tab.edit("db-x", ["a", "b-1"]);
  bridge.failPosts = true; store.failWrites = true; tab.pagehide(); await settle();
  bridge.failPosts = false;
  await reload(store, legacy);
  assert.deepEqual(serverValues(bridge, "db-x"), ["a", "b-1"], "T5: the unload edit is lost");
});

const LEGACY_STATE_KEY = "osionos.knownDatabaseState.v1";

// S1 migrates without retiring the legacy keys (the flag is refused), and leaves offline with e1.
// S2 has no IndexedDB and writes e2 to the legacy key. A tab whose readiness reads no journals (an
// older build) redoes the migration; S1's journal must not land on the redone copy at the next load.
test("T6: a journal of an earlier migration never lands on a redone one", async (t) => {
  const L0 = withDb(EMPTY, "db-x", ["x-1", "x-2"]);
  const legacy = memoryLegacy({ [LEGACY_STATE_KEY]: serializeKnownDatabaseState(L0, new Set()), "osionos.objectDb.pushed.v1": JSON.stringify({ "db-x": hashOf(L0, "db-x") }) });
  const bridge = useBridge(t, { "db-x": sliceOf(L0, "db-x") });
  const store = createMemoryKeyValueStore();
  legacy.refuseWrites = true;
  const s1 = openTab(store, { legacy, tabId: "tab-a" }); await s1.persistence.ready;
  legacy.refuseWrites = false;
  s1.edit("db-x", ["x-1", "e1"]);
  bridge.failPosts = true; store.failWrites = true; s1.pagehide(); await settle();
  assert.ok(legacy.values.has("osionos.kds.journal.v1.tab-a"));
  resetObjectDatabaseSync();
  const s2 = openTab(createMemoryKeyValueStore(), { legacy, isUnavailable: true, tabId: "tab-b" }); await s2.persistence.ready;
  assert.equal(s2.persistence.mode(), "fallback-legacy");
  s2.edit("db-x", ["x-1", "e2"]);
  legacy.values.set(LEGACY_STATE_KEY, serializeKnownDatabaseState(s2.live.state, new Set())); // the legacy writer's flush
  bridge.failPosts = false; store.failWrites = false;
  await openDurableCopy({ openStore: async () => store, legacy, tabId: "tab-c", budgetMs: 500 }).ready;
  assert.ok(legacy.values.has("osionos.kds.journal.v1.tab-a"));
  const s3 = await reload(store, legacy);
  assert.deepEqual(valuesOf(s3.live.state, "db-x"), ["e2", "x-1"]);
  assert.ok(serverValues(bridge, "db-x").includes("e2"), "T6: S2's newer edit reverted by the S1 journal");
});

test("T7: two tabs leave offline with edits on different databases → both reach the server", async (t) => {
  const { bridge, store, legacy, tab: a } = await freshTab(t, XY);
  a.edit("db-x", ["a", "b-A"]);
  const b = openTab(store, { legacy, tabId: "tab-b" }); await b.persistence.ready;
  b.edit("db-y", ["y-B"]);
  bridge.failPosts = true; store.failWrites = true;
  a.pagehide(); b.pagehide(); await settle();
  bridge.failPosts = false;
  await reload(store, legacy);
  assert.deepEqual(serverValues(bridge, "db-y"), ["y-B"]);
  assert.deepEqual(serverValues(bridge, "db-x"), ["a", "b-A"], "T7: tab A's unload edit lost");
});

// The journal written at hidden carries the pre-push record; the hidden tab then lives on, its
// commit lands, the push is acked and the acked record stored; the tab is discarded without pagehide.
test("T8: a hidden tab's journal never regresses a record acked after it", async (t) => {
  const { bridge, store, legacy, tab } = await freshTab(t, X);
  store.delayMs = 30;
  tab.edit("db-x", ["a", "b-1"]); tab.hide(); // commit, journal; push after the commit
  await settle(150); store.delayMs = 0;
  assert.equal(storedPair(store).record["db-x"], hashOf(withDb(EMPTY, "db-x", ["a", "b-1"]), "db-x"));
  assert.ok(legacy.values.has("osionos.kds.journal.v1.tab-a"));
  bridge.server.set("db-x", withDb(EMPTY, "db-x", ["a", "b-OTHER"])); // another device
  await reload(store, legacy);
  assert.deepEqual(serverValues(bridge, "db-x"), ["a", "b-OTHER"], "T8: another device's edit reverted");
});

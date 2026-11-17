/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   known-database-revert-sequences.test.ts            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The devil's D1 sequences (2026-11-17) on the P1 code. Each one, under the rules as first
// worded, stored a push record that ran ahead of the stored copy, or pushed a copy captured
// before an await; the next push then sent another device's database back to its old values.
// db-x is always the database another device changed on the server (X_OLD -> X_NEW): no test
// may see this browser push db-x, and the server must keep X_NEW.

import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

await import("./support/memory-local-storage.ts");
await import("./support/stub-bridge.ts");
Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { search: "", hash: "" }, localStorage: globalThis.localStorage } });
(globalThis as Record<string, unknown>).__playgroundUserStore = { getState: () => ({ activePageJwt: () => "test-jwt" }) };

const kds = await import("./support/kds-tab.ts");
const { openDurableCopy } = await import("../../src/widgets/database-view/model/knownDatabaseDurableCopy.ts");
const { pushDirtyObjectDatabases } = await import("../../src/widgets/database-view/model/objectDatabaseBridgeSync.ts");
const { serializeKnownDatabaseState } = await import("../../src/widgets/database-view/model/knownDatabasePersistedState.ts");
const { EMPTY, X_OLD, X_NEW, withDb, sliceOf, hashOf, valuesOf, settle } = kds;
type Bridge = ReturnType<typeof kds.useBridge>;

const S0 = withDb(withDb(EMPTY, "db-x", X_OLD), "db-y", ["y-1"]);
const CLEAN = { "db-x": hashOf(S0, "db-x"), "db-y": hashOf(S0, "db-y") };
const SERVER = { "db-x": withDb(EMPTY, "db-x", X_NEW), "db-y": sliceOf(S0, "db-y") };

function assertNoRevert(bridge: Bridge): void {
  assert.deepEqual(kds.postedValues(bridge, "db-x"), [], "this browser never pushes db-x");
  assert.deepEqual(valuesOf(bridge.server.get("db-x"), "db-x"), X_NEW);
}

async function reloadAndCheck(store: ReturnType<typeof kds.storeWith>, bridge: Bridge): Promise<void> {
  kds.assertStoredPairConsistent(store, bridge);
  const reloaded = await kds.reload(store);
  assert.deepEqual(valuesOf(reloaded.live.state, "db-x"), X_NEW, "the reload takes the server's db-x");
  assertNoRevert(bridge);
}

test("B1a: the hydrate's own push never stores its record next to the last committed copy", async (t) => {
  const store = kds.storeWith(S0, CLEAN);
  const bridge = kds.useBridge(t, SERVER);
  const tab = kds.openTab(store);
  await tab.persistence.ready;
  tab.edit("db-y", ["y-2"]);
  tab.flush();
  await settle(); // committed before the hydrate: the stored copy is this tab's last commit
  await tab.hydrate();
  await settle(); // db-x takes the server's copy; the hydrate pushes y-2 and runs the record catch-up
  assert.deepEqual(kds.postedValues(bridge, "db-y"), [["y-2"]]);
  assert.deepEqual(tab.commitReports, [true]);
  await reloadAndCheck(store, bridge); // closed before the merged state's commit
});

// A hydrate lands while a flush's commit is awaited (a realtime refresh in the app; the first
// hydrate of the session here). Its own push finishes inside that await.
async function hydrateDuringCommit(t: TestContext) {
  const store = kds.storeWith(S0, CLEAN);
  const bridge = kds.useBridge(t, SERVER);
  const tab = kds.openTab(store);
  await tab.persistence.ready;
  store.delayMs = 120;
  tab.edit("db-y", ["y-2"]);
  tab.flush(); // the commit of y-2 is awaited for 120 ms
  await tab.hydrate(); // db-x takes the server's copy, y-2 is pushed
  await settle(40);
  assert.deepEqual(tab.commitReports, [], "the commit is still awaited");
  store.delayMs = 0;
  await settle(200);
  assert.deepEqual(tab.commitReports, [true]);
  return { store, bridge };
}

test("B1b: a hydrate that lands during a commit await never gets its record stored next to that commit", async (t) => {
  const { store, bridge } = await hydrateDuringCommit(t);
  await reloadAndCheck(store, bridge);
});

test("B5: the push after a commit sends the live state, never the state captured before the await", async (t) => {
  const { bridge } = await hydrateDuringCommit(t);
  assert.deepEqual(kds.postedValues(bridge, "db-y"), [["y-2"]], "the edit still reaches the server");
  assertNoRevert(bridge); // the captured copy still holds the old db-x
});

test("B2: the merged state's commit fails and an earlier push finishes later: no record is stored", async (t) => {
  const store = kds.storeWith(S0, CLEAN);
  const bridge = kds.useBridge(t, SERVER);
  const tab = kds.openTab(store);
  await tab.persistence.ready;
  tab.edit("db-y", ["y-2"]);
  tab.flush();
  await settle(); // c1 (y-2) is stored; its push waits for the hydrate
  const release = bridge.hold();
  await tab.hydrate(); // db-x takes the server's copy; the push of y-2 is held
  store.failWrites = true;
  tab.flush();
  await settle(); // the merged state's commit fails: toast and leave guard
  assert.deepEqual(tab.commitReports, [true, false]);
  release();
  await settle(); // the earlier push finishes after the failure and runs the catch-up
  store.failWrites = false;
  assert.deepEqual(kds.postedValues(bridge, "db-y"), [["y-2"]]);
  await reloadAndCheck(store, bridge);
});

test("B4: two tabs commit with two ids; one tab's record is never stored next to the other's state", async (t) => {
  const s0 = withDb(withDb(EMPTY, "db-x", ["x-1", "x-2"]), "db-w", ["w-1"]);
  const record = { "db-x": hashOf(s0, "db-x"), "db-w": hashOf(s0, "db-w") };
  const store = kds.storeWith(s0, record);
  const bridge = kds.useBridge(t, { "db-x": sliceOf(s0, "db-x"), "db-w": sliceOf(s0, "db-w") });
  const tabA = kds.openTab(store, { tabId: "tab-a" });
  await tabA.persistence.ready;
  await tabA.hydrate();
  await settle();
  const tabB = openDurableCopy({ openStore: () => Promise.resolve(store), legacy: undefined, tabId: "tab-b" });
  await tabB.ready; // B loaded before A's edit and never sees it
  const release = bridge.hold();
  tabA.edit("db-x", ["x-1", "x-A"]);
  tabA.flush();
  await settle(); // A's commit is stored; its push is held
  // B's own edit is a database only B holds: a dirty edit next to its clean record is a pair a
  // reload pushes, and the helper cannot tell it from a stale one by hashes alone.
  const stateB = withDb(s0, "db-b", ["b-1"]);
  assert.equal(await tabB.commit(stateB, serializeKnownDatabaseState(stateB, new Set()), record), true);
  release();
  await settle(); // A's push finishes; its catch-up finds B's id and stores nothing
  assert.equal(kds.storedPair(store).id, "tab-b:1");
  kds.assertStoredPairConsistent(store, bridge);
  const reloaded = await kds.reload(store);
  assert.deepEqual(valuesOf(reloaded.live.state, "db-x"), ["x-1", "x-A"]);
  assert.deepEqual(kds.postedValues(bridge, "db-x"), [["x-1", "x-A"]], "only A's own edit is pushed");
  assert.deepEqual(valuesOf(bridge.server.get("db-x"), "db-x"), ["x-1", "x-A"]);
});

test("B3: a session that fell back with the flag set pushes nothing; the next IndexedDB load reverts nothing", async (t) => {
  const s0 = withDb(EMPTY, "db-y", ["y-1", "y-2"]);
  const store = kds.storeWith(s0, {}); // db-y has no record: the stored copy reads dirty
  const bridge = kds.useBridge(t, { "db-y": sliceOf(s0, "db-y") });
  const legacy = kds.memoryLegacy({ "osionos.kds.idb": "1" });
  const fallback = kds.openTab(store, { isUnavailable: true, legacy });
  await fallback.persistence.ready;
  assert.equal(fallback.persistence.mode(), "fallback-flagged");
  assert.equal(fallback.readOnlyWarnings, 1, "one read-only toast");
  await fallback.hydrate();
  await settle();
  assert.deepEqual(valuesOf(fallback.live.state, "db-y"), ["y-1", "y-2"], "the server copy is pulled over the seed");
  assert.equal(fallback.edit("db-y", ["y-1", "y-NEW"]), false, "store writes are no-ops");
  pushDirtyObjectDatabases(withDb(fallback.live.state, "db-y", ["y-1", "y-NEW"]), kds.NO_SEEDS);
  await settle();
  assert.equal(bridge.posts.length, 0, "pull-only: nothing is pushed");
  assert.equal(store.writes, 0, "the durable copy is never written");
  assert.deepEqual([...legacy.values.keys()], ["osionos.kds.idb"], "neither is localStorage");
  const reloaded = await kds.reload(store);
  assert.deepEqual(valuesOf(reloaded.live.state, "db-y"), ["y-1", "y-2"]);
  assert.deepEqual(valuesOf(bridge.server.get("db-y"), "db-y"), ["y-1", "y-2"], "the server copy is not reverted");
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   known-database-reload-cases.test.ts                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// What a reload reads after a write or a push failed (P1 design D1, cases i-iii). The stored
// state and the stored push record must describe the same moment: a record ahead of its state
// turns a stale database into a dirty one, and its stale values are pushed over the server's.

import assert from "node:assert/strict";
import test from "node:test";

await import("./support/memory-local-storage.ts");
await import("./support/stub-bridge.ts");
Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { search: "", hash: "" }, localStorage: globalThis.localStorage } });
(globalThis as Record<string, unknown>).__playgroundUserStore = { getState: () => ({ activePageJwt: () => "test-jwt" }) };

const kds = await import("./support/kds-tab.ts");
const { EMPTY, X_OLD, X_NEW, withDb, sliceOf, hashOf, valuesOf, settle } = kds;

const S0 = withDb(EMPTY, "db-y", ["y-1"]);

async function hydratedTab(t: Parameters<Parameters<typeof test>[1]>[0]) {
  const store = kds.storeWith(S0, { "db-y": hashOf(S0, "db-y") });
  const bridge = kds.useBridge(t, { "db-y": sliceOf(S0, "db-y") });
  const tab = kds.openTab(store);
  await tab.persistence.ready;
  await tab.hydrate();
  await settle();
  assert.equal(bridge.posts.length, 0, "a clean copy pushes nothing");
  return { store, bridge, tab };
}

test("(i) the hydrate's write is lost: the next load repeats the same hydrate and pushes nothing stale", async (t) => {
  const s0 = withDb(withDb(EMPTY, "db-x", X_OLD), "db-d", ["d-2"]);
  const record = { "db-x": hashOf(s0, "db-x"), "db-d": hashOf(withDb(EMPTY, "db-d", ["d-1"]), "db-d") }; // db-d is dirty
  const store = kds.storeWith(s0, record);
  const bridge = kds.useBridge(t, { "db-x": withDb(EMPTY, "db-x", X_NEW), "db-d": withDb(EMPTY, "db-d", ["d-1"]) });
  const tab = kds.openTab(store);
  await tab.persistence.ready;
  await tab.hydrate();
  await settle();
  store.failWrites = true;
  tab.flush();
  await settle();
  store.failWrites = false;
  assert.deepEqual(tab.commitReports, [false], "the merged state is never stored");
  kds.assertStoredPairConsistent(store, bridge);
  const reloaded = await kds.reload(store);
  for (const key of ["db-x", "db-d"]) assert.deepEqual(valuesOf(reloaded.live.state, key), valuesOf(tab.live.state, key), key);
  assert.deepEqual(kds.postedValues(bridge, "db-x"), [], "db-x is never pushed");
  assert.deepEqual(kds.postedValues(bridge, "db-d"), [["d-2"], ["d-2"]], "the dirty edit is pushed again, unchanged");
  assert.deepEqual(valuesOf(bridge.server.get("db-x"), "db-x"), X_NEW);
});

test("(ii) the write fails and the push succeeds: the reload takes the server's version", async (t) => {
  const { store, bridge, tab } = await hydratedTab(t);
  store.failWrites = true;
  tab.edit("db-y", ["y-2"]);
  tab.flush();
  await settle();
  store.failWrites = false;
  assert.deepEqual(tab.commitReports, [false]);
  assert.deepEqual(kds.postedValues(bridge, "db-y"), [["y-2"]], "a failed write does not stop the push");
  assert.deepEqual(kds.storedPair(store).record, { "db-y": hashOf(S0, "db-y") }, "the record was not stored");
  const reloaded = await kds.reload(store);
  assert.deepEqual(valuesOf(reloaded.live.state, "db-y"), ["y-2"]);
  assert.equal(bridge.posts.length, 1, "the reload pushes nothing");
});

test("(iii) an offline edit commits and its push fails: the reload reads it dirty, unions and pushes it", async (t) => {
  const { store, bridge, tab } = await hydratedTab(t);
  bridge.failPosts = true;
  tab.edit("db-y", ["y-2"]);
  tab.flush();
  await settle();
  bridge.failPosts = false;
  const stored = kds.storedPair(store);
  assert.deepEqual(valuesOf(stored.state, "db-y"), ["y-2"]);
  assert.equal(stored.record["db-y"], undefined, "the failed push dropped db-y from the stored record");
  const reloaded = await kds.reload(store);
  assert.deepEqual(valuesOf(reloaded.live.state, "db-y"), ["y-2"]);
  assert.deepEqual(kds.postedValues(bridge, "db-y"), [["y-2"]]);
  assert.deepEqual(valuesOf(bridge.server.get("db-y"), "db-y"), ["y-2"]);
});

test("control: a pushed commit stores its record, and the reload pushes nothing", async (t) => {
  const { store, bridge, tab } = await hydratedTab(t);
  tab.edit("db-y", ["y-2"]);
  tab.flush();
  await settle();
  assert.deepEqual(tab.commitReports, [true]);
  assert.deepEqual(kds.storedPair(store).record, { "db-y": hashOf(tab.live.state, "db-y") }, "the record caught up");
  await kds.reload(store);
  assert.deepEqual(kds.postedValues(bridge, "db-y"), [["y-2"]], "pushed once, by the edit");
});

test("pagehide: the commit is started and the live state is pushed at once", async (t) => {
  const { store, bridge, tab } = await hydratedTab(t);
  store.delayMs = 100;
  tab.edit("db-y", ["y-2"]);
  tab.flush(true);
  await settle(20);
  assert.deepEqual(tab.commitReports, [], "the commit is still awaited");
  assert.deepEqual(kds.postedValues(bridge, "db-y"), [["y-2"]], "pushed before the commit settled");
  store.delayMs = 0;
  await settle(150);
  assert.deepEqual(tab.commitReports, [true]);
});

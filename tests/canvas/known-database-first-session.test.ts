/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   known-database-first-session.test.ts               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A first session on an empty durable copy, reloaded before any commit resolved (devil R8, the red
// templateUse e2e). The empty store gave the unload journal no base, so the lost pagehide commit
// took the edit with it. Readiness now stores the seed; these cases are the devil's R8-1..R8-4 and
// RC3. Synthetic data only.

import assert from "node:assert/strict";
import test from "node:test";

await import("./support/memory-local-storage.ts");
await import("./support/stub-bridge.ts");
await import("./support/kds-browser.ts");

const kds = await import("./support/kds-tab.ts");
const { createMemoryKeyValueStore } = await import("./support/memory-key-value-store.ts");
const { openDurableCopy } = await import("../../src/widgets/database-view/model/knownDatabaseDurableCopy.ts");
const { serializeKnownDatabaseState } = await import("../../src/widgets/database-view/model/knownDatabasePersistedState.ts");
const { EMPTY, withDb, valuesOf, settle, memoryLegacy, openTab, reload, useBridge, postedValues, X_OLD, X_NEW } = kds;
type Legacy = ReturnType<typeof memoryLegacy>;

const journalChars = (legacy: Legacy) => [...legacy.values]
  .filter(([key]) => key.startsWith("osionos.kds.journal")).reduce((sum, [, value]) => sum + value.length, 0);

// The reload: the pagehide commit is lost (I10), every write after it lands again.
async function pagehideThenReload(tab: ReturnType<typeof openTab>, store: ReturnType<typeof createMemoryKeyValueStore>, legacy: Legacy) {
  store.failWrites = true; tab.pagehide(); await settle();
  store.failWrites = false;
  return reload(store, legacy);
}

function largeAccount(dbCount: number, rows: number, width: number) {
  const server: Record<string, ReturnType<typeof withDb>> = {};
  for (let db = 0; db < dbCount; db += 1) {
    const key = `big-${db}`;
    server[key] = withDb(EMPTY, key, Array.from({ length: rows }, (_, row) => `${key}-${row}-`.padEnd(width, "x")));
  }
  return server;
}

test("R8-1 offline: an edit on an empty store, reloaded before the first commit resolved, survives", async (t) => {
  useBridge(t, {}).failPosts = true; // the e2e build has no bridge: every push is lost
  const store = createMemoryKeyValueStore();
  const legacy = memoryLegacy();
  const tab = openTab(store, { legacy });
  await tab.persistence.ready;
  assert.equal(tab.persistence.mode(), "idb");
  tab.edit("db-assignments", ["Write Integration Tests", "Private assignment"]); // inside the debounce
  const reloaded = await pagehideThenReload(tab, store, legacy);
  assert.deepEqual(valuesOf(reloaded.live.state, "db-assignments"), ["Private assignment", "Write Integration Tests"]);
});

test("control: the same edit after the first commit resolved survives the reload", async (t) => {
  useBridge(t, {}).failPosts = true;
  const store = createMemoryKeyValueStore();
  const legacy = memoryLegacy();
  const tab = openTab(store, { legacy });
  await tab.persistence.ready;
  tab.edit("db-assignments", ["Write Integration Tests"]); tab.flush(); await settle();
  tab.edit("db-assignments", ["Write Integration Tests", "Private assignment"]);
  const reloaded = await pagehideThenReload(tab, store, legacy);
  assert.deepEqual(valuesOf(reloaded.live.state, "db-assignments"), ["Private assignment", "Write Integration Tests"]);
});

test("R8-2 online, large account: the first-session journal stays under the cap and the pagehide pushes", async (t) => {
  const bridge = useBridge(t, largeAccount(25, 100, 500));
  const store = createMemoryKeyValueStore();
  const legacy = memoryLegacy();
  const tab = openTab(store, { legacy });
  await tab.persistence.ready;
  await tab.hydrate(); await settle();
  tab.edit("db-new", ["typed"]);
  store.failWrites = true; tab.pagehide(); await settle();
  assert.ok(journalChars(legacy) > 0 && journalChars(legacy) < 10_000, `journal of ${journalChars(legacy)} characters`);
  assert.deepEqual(postedValues(bridge, "db-new"), [["typed"]]);
  store.failWrites = false;
  const reloaded = await reload(store, legacy);
  assert.deepEqual(valuesOf(reloaded.live.state, "db-new"), ["typed"]);
});

test("R8-3 online: a clean hydrated database left out of the journal takes another device's later edit", async (t) => {
  const bridge = useBridge(t, { x: withDb(EMPTY, "x", X_OLD) });
  const store = createMemoryKeyValueStore();
  const legacy = memoryLegacy();
  const tab = openTab(store, { legacy });
  await tab.persistence.ready;
  await tab.hydrate(); await settle();
  tab.edit("y", ["typed-y"]);
  store.failWrites = true; tab.pagehide(); await settle();
  bridge.server.set("x", withDb(EMPTY, "x", X_NEW)); // another device
  const postsBefore = bridge.posts.length;
  store.failWrites = false;
  const reloaded = await reload(store, legacy);
  assert.deepEqual(valuesOf(reloaded.live.state, "x"), [...X_NEW].sort());
  assert.deepEqual(valuesOf(bridge.server.get("x"), "x"), [...X_NEW].sort());
  assert.ok(!bridge.posts.slice(postsBefore).some((post) => post.dbKey === "x"), "the reload pushed x");
  assert.deepEqual(valuesOf(reloaded.live.state, "y"), ["typed-y"]);
});

test("R8-4 offline: a dirty hydrated database no base holds is journaled and survives", async (t) => {
  const bridge = useBridge(t, { x: withDb(EMPTY, "x", X_OLD) });
  const store = createMemoryKeyValueStore();
  const legacy = memoryLegacy();
  const tab = openTab(store, { legacy });
  await tab.persistence.ready;
  await tab.hydrate(); await settle();
  bridge.failPosts = true;
  tab.edit("x", ["x-mine", "x-old-2"]); // same row count: the reconcile keeps the local side as the union base
  const reloaded = await pagehideThenReload(tab, store, legacy);
  assert.deepEqual(valuesOf(reloaded.live.state, "x"), ["x-mine", "x-old-2"]);
});

const LEGACY_STATE_KEY = "osionos.knownDatabaseState.v1";

// RC3: the seed copy is a migrated one, so a seed put the 3 s budget abandoned is redone from the
// legacy copy the fallback session kept writing, instead of loading over it.
test("RC3: a seed write the budget abandoned yields to the fallback session's legacy edit", async () => {
  const store = createMemoryKeyValueStore();
  store.commitDelayMs = 3_200; // the put landed; its transaction completes after the budget
  const legacy = memoryLegacy();
  const seedText = () => serializeKnownDatabaseState(EMPTY, new Set());
  const first = openDurableCopy({ openStore: async () => store, legacy, tabId: "tab-a", seedText });
  assert.equal((await first.ready).mode, "fallback-legacy");
  legacy.setItem(LEGACY_STATE_KEY, serializeKnownDatabaseState(withDb(EMPTY, "db-x", ["typed"]), new Set())); // its writer
  await settle(400);
  assert.equal((store.entries.get("state") as { id?: string } | undefined)?.id, "migrated:tab-a", "no seed put was in flight");
  const next = createMemoryKeyValueStore(Object.fromEntries(store.entries));
  const loaded = await openDurableCopy({ openStore: async () => next, legacy, tabId: "tab-b", seedText }).ready;
  assert.equal(loaded.mode, "idb");
  assert.ok(loaded.text?.includes("typed"), "the next load read the seed over the legacy edit");
});

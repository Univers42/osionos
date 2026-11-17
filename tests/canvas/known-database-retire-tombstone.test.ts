/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   known-database-retire-tombstone.test.ts            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The devil's C7 re-rule (ADR 0054): on an origin that refuses every growing write the 15-character
// flag never fits, the legacy pair stayed unmarked, and a later load whose IndexedDB failed read it
// as fallback-legacy. A shrinking overwrite still fits, so the state key now holds a 20-character
// tombstone that marks the origin retired. Ported from devil-c7.test.ts onto the kds-tab harness.

import assert from "node:assert/strict";
import test from "node:test";

await import("./support/memory-local-storage.ts");
await import("./support/stub-bridge.ts");
await import("./support/kds-browser.ts");

const kds = await import("./support/kds-tab.ts");
const { openDurableCopy, KDS_IDB_FLAG_KEY: FLAG } = await import("../../src/widgets/database-view/model/knownDatabaseDurableCopy.ts");
const { resetObjectDatabaseSync } = await import("../../src/widgets/database-view/model/objectDatabaseBridgeSync.ts");
const { serializeKnownDatabaseState, loadPersistedKnownDatabaseState } = await import("../../src/widgets/database-view/model/knownDatabasePersistedState.ts");
const { createMemoryKeyValueStore } = await import("./support/memory-key-value-store.ts");
const { growthRefusingStorage } = await import("./support/growth-refusing-storage.ts");
const { EMPTY, X_NEW, withDb, sliceOf, hashOf, valuesOf, settle } = kds;
type NotionState = typeof EMPTY;
type MemoryStore = ReturnType<typeof createMemoryKeyValueStore>;
type Origin = ReturnType<typeof growthRefusingStorage>;

const STATE = "osionos.knownDatabaseState.v1";
const PUSHED = "osionos.objectDb.pushed.v1";
const TOMBSTONE = '{"kdsRetired":"idb"}';
// The journals share the origin; only the three retirement keys are logged.
const RETIREMENT_KEYS = new Set([STATE, PUSHED, FLAG]);

const text = (state: NotionState) => serializeKnownDatabaseState(state, new Set());
const isMarked = (values: Map<string, string>) => values.get(FLAG) === "1" || values.get(STATE) === TOMBSTONE;

/** An origin holding the legacy state `local` and a push record claiming `pushed`'s db-x. */
function legacyPair(local: NotionState, pushed: NotionState): Map<string, string> {
  return new Map([[STATE, text(local)], [PUSHED, JSON.stringify({ "db-x": hashOf(pushed, "db-x") })]]);
}

function origin(values: Map<string, string>, refusesGrowth: boolean): Origin {
  const storage = growthRefusingStorage(values, RETIREMENT_KEYS);
  storage.refusesGrowth = refusesGrowth;
  return storage;
}

async function reloadWithoutIndexedDb(store: MemoryStore, legacy: Origin) {
  resetObjectDatabaseSync();
  const tab = kds.openTab(createMemoryKeyValueStore(Object.fromEntries(store.entries)), { tabId: "tab-reloaded", legacy, isUnavailable: true });
  await tab.persistence.ready;
  await tab.hydrate();
  await settle(60);
  return tab;
}

const LOCAL = withDb(EMPTY, "db-x", ["x-local-1", "x-local-2"]);
const PREVIOUS = withDb(EMPTY, "db-x", ["x-prev-1", "x-prev-2"]);

test("C7-N1b: growth refused forever, the tombstone marks the origin and a later IndexedDB failure pushes nothing", async (t) => {
  const legacy = origin(legacyPair(LOCAL, PREVIOUS), true);
  const bridge = kds.useBridge(t, { "db-x": sliceOf(PREVIOUS, "db-x") });
  const store = createMemoryKeyValueStore();
  const first = kds.openTab(store, { legacy });
  await first.persistence.ready;
  await first.hydrate();
  await settle(40);
  assert.equal(legacy.values.get(STATE), TOMBSTONE);
  assert.equal(legacy.values.has(PUSHED), false, "the push record is gone behind the tombstone");
  assert.equal(legacy.values.has(FLAG), false, "the flag never fitted");
  bridge.server.set("db-x", withDb(EMPTY, "db-x", X_NEW)); // another device edits db-x
  bridge.posts = [];
  const second = await reloadWithoutIndexedDb(store, legacy);
  assert.equal(second.persistence.mode(), "fallback-flagged");
  assert.deepEqual(kds.postedValues(bridge, "db-x"), [], "C7-N1b: the frozen legacy pair pushed db-x");
  assert.deepEqual(valuesOf(bridge.server.get("db-x"), "db-x"), X_NEW);
});

test("C7-N1c: a refused flag makes the offline fallback read-only, and the next load with room stores the flag", async (t) => {
  const local = withDb(EMPTY, "db-x", ["x-1"]);
  const legacy = origin(legacyPair(local, local), true);
  const bridge = kds.useBridge(t, { "db-x": sliceOf(local, "db-x") });
  const store = createMemoryKeyValueStore();
  const first = kds.openTab(store, { legacy });
  await first.persistence.ready;
  await first.hydrate();
  assert.equal(first.edit("db-y", ["y-1"]), true);
  first.flush();
  await settle(40);
  legacy.refusesGrowth = false;
  bridge.failPosts = true;
  const second = await reloadWithoutIndexedDb(store, legacy);
  assert.equal(second.persistence.mode(), "fallback-flagged");
  assert.equal(second.persistence.canWrite(), false);
  bridge.failPosts = false;
  const third = await kds.reload(store, legacy);
  assert.deepEqual(valuesOf(third.live.state, "db-y"), ["y-1"], "the first session's committed edit");
  assert.equal(legacy.values.get(FLAG), "1", "the retry stored the flag");
  assert.equal(legacy.values.has(STATE) || legacy.values.has(PUSHED), false, "the retry removed the tombstone");
});

test("C7-CAND: a refusal that ends keeps the unpushed migrated edit through the tombstone", async (t) => {
  const legacy = origin(legacyPair(LOCAL, PREVIOUS), true);
  const bridge = kds.useBridge(t, { "db-x": sliceOf(PREVIOUS, "db-x") });
  const store = createMemoryKeyValueStore();
  await kds.openTab(store, { legacy }).persistence.ready; // migrates, then closes before any push
  assert.match((store.entries.get("state") as { id: string }).id, /^migrated:/);
  legacy.refusesGrowth = false;
  const second = await reloadWithoutIndexedDb(store, legacy);
  // The pre-P1 writer, had the fallback been fallback-legacy and writable.
  if (second.persistence.mode() === "fallback-legacy") legacy.values.set(STATE, text(second.live.state));
  const third = await kds.reload(store, legacy);
  const local = valuesOf(third.live.state, "db-x");
  const server = valuesOf(bridge.server.get("db-x"), "db-x");
  assert.ok(local.includes("x-local-1") || server.includes("x-local-1"), "the unpushed migrated edit is lost");
});

/** Replays the first `count` logged writes over `initial`. */
function replay(initial: Map<string, string>, log: Origin["log"], count: number): Map<string, string> {
  const values = new Map(initial);
  for (const [op, key, value] of log.slice(0, count)) {
    if (op === "set") values.set(key, value ?? "");
    else values.delete(key);
  }
  return values;
}

for (const refusesGrowth of [true, false]) {
  test(`C7-prefix (growth refused: ${refusesGrowth}): every prefix of the retirement keeps a marker or the intact pair`, async (t) => {
    const local = withDb(EMPTY, "db-x", ["x-1"]);
    const initial = legacyPair(local, withDb(EMPTY, "db-x", ["x-0"]));
    const legacy = origin(new Map(initial), refusesGrowth);
    kds.useBridge(t, { "db-x": sliceOf(local, "db-x") });
    await kds.openTab(createMemoryKeyValueStore(), { legacy }).persistence.ready;
    assert.ok(legacy.log.length > 0, "the retirement wrote nothing");
    for (let count = 0; count <= legacy.log.length; count++) {
      const values = replay(initial, legacy.log, count);
      const isIntact = values.get(STATE) === initial.get(STATE) && values.get(PUSHED) === initial.get(PUSHED);
      assert.ok(isMarked(values) || isIntact, `prefix ${count}: no marker and a broken pair ${JSON.stringify([...values.keys()])}`);
    }
  });
}

test("C7-common: with room for the flag, the flag is stored, both keys go and no tombstone is written", async (t) => {
  const local = withDb(EMPTY, "db-x", ["x-1"]);
  const legacy = origin(legacyPair(local, local), false);
  kds.useBridge(t, { "db-x": sliceOf(local, "db-x") });
  await kds.openTab(createMemoryKeyValueStore(), { legacy }).persistence.ready;
  assert.deepEqual(legacy.log, [["set", FLAG, "1"], ["remove", STATE, null], ["remove", PUSHED, null]]);
});

test("C7-tomb-no-copy: a tombstoned origin whose IndexedDB copy is gone migrates neither the tombstone nor the record", async () => {
  const legacy = origin(new Map([[STATE, TOMBSTONE], [PUSHED, JSON.stringify({ "db-x": hashOf(PREVIOUS, "db-x") })]]), true);
  const store = createMemoryKeyValueStore();
  // seedText (A2): the empty store stores the seed at readiness, never paired with the legacy record.
  const loaded = await openDurableCopy({ openStore: async () => store, legacy, tabId: "tab-a", budgetMs: 400, seedText: () => text(EMPTY) }).ready;
  const stored = store.entries.get("state") as { text?: string } | undefined;
  const pushed = store.entries.get("pushed") as { map?: Record<string, string> } | undefined;
  assert.notEqual(loaded.text, TOMBSTONE);
  assert.deepEqual(loaded.record, {});
  assert.notEqual(stored?.text, TOMBSTONE);
  assert.deepEqual(pushed?.map ?? {}, {}, "the legacy record was stored next to the seed");
});

test("C7-short-state: a legacy text shorter than the tombstone keeps both keys byte-identical (R-C7b)", async (t) => {
  const legacy = origin(new Map([[STATE, "{}"], [PUSHED, "{}"]]), true);
  const before = JSON.stringify([...legacy.values]);
  kds.useBridge(t, {});
  await kds.openTab(createMemoryKeyValueStore(), { legacy }).persistence.ready;
  assert.equal(JSON.stringify([...legacy.values].filter(([key]) => RETIREMENT_KEYS.has(key))), before);
});

test("C7-old-reader: the pre-P1 loader reads the tombstone as no databases, so the seed", () => {
  const CAUGHT = "threw (the pre-P1 caller catches and returns the seed)";
  let databases: string[] | string;
  try {
    databases = Object.keys(loadPersistedKnownDatabaseState(TOMBSTONE, EMPTY).state.databases);
  } catch {
    databases = CAUGHT;
  }
  assert.ok(databases === CAUGHT || (Array.isArray(databases) && databases.length === 0), JSON.stringify(databases));
});

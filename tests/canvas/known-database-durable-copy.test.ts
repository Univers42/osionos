import assert from "node:assert/strict";
import test from "node:test";

import type { KeyValueStore } from "../../src/shared/lib/key-value-store/indexedKeyValueStore.ts";
import {
  KDS_IDB_FLAG_KEY,
  openDurableCopy,
  type DurableCopy,
} from "../../src/widgets/database-view/model/knownDatabaseDurableCopy.ts";
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from "./support/memory-key-value-store.ts";

const STATE_KEY = "osionos.knownDatabaseState.v1";
const PUSHED_KEY = "osionos.objectDb.pushed.v1";

interface FakeLegacy {
  values: Map<string, string>;
  calls: string[];
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function fakeLegacy(initial: Record<string, string> = {}): FakeLegacy {
  const values = new Map(Object.entries(initial));
  const calls: string[] = [];
  return {
    values,
    calls,
    getItem(key) { calls.push(`get:${key}`); return values.get(key) ?? null; },
    setItem(key, value) { calls.push(`set:${key}`); values.set(key, value); },
    removeItem(key) { calls.push(`remove:${key}`); values.delete(key); },
  };
}

const LEGACY = { [STATE_KEY]: "legacy-text", [PUSHED_KEY]: JSON.stringify({ a: "h1" }) };

function open(store: KeyValueStore, legacy: FakeLegacy, tabId = "tabA", budgetMs = 500): DurableCopy {
  return openDurableCopy({ openStore: async () => store, legacy, tabId, budgetMs });
}

function stored(store: MemoryKeyValueStore, key: string): Record<string, unknown> {
  return store.entries.get(key) as Record<string, unknown>;
}

test("durable-copy: a fresh store with no legacy keys starts from the seed", async () => {
  const store = createMemoryKeyValueStore();
  const legacy = fakeLegacy();
  const loaded = await open(store, legacy).ready;

  assert.deepEqual(loaded, { mode: "idb", text: null, record: {} });
  assert.equal(store.writes, 0);
  assert.equal(legacy.values.has(KDS_IDB_FLAG_KEY), false);
});

test("durable-copy: legacy keys migrate, the flag is set before they are removed", async () => {
  const store = createMemoryKeyValueStore();
  const legacy = fakeLegacy(LEGACY);
  const loaded = await open(store, legacy).ready;

  assert.deepEqual(loaded, { mode: "idb", text: "legacy-text", record: { a: "h1" } });
  assert.deepEqual(stored(store, "state"), { text: "legacy-text", id: "migrated" });
  assert.deepEqual(stored(store, "pushed"), { map: { a: "h1" }, stateId: "migrated" });
  assert.equal(legacy.values.get(KDS_IDB_FLAG_KEY), "1");
  assert.equal(legacy.values.has(STATE_KEY) || legacy.values.has(PUSHED_KEY), false);
  const mutations = legacy.calls.filter(call => !call.startsWith("get:"));
  assert.deepEqual(mutations, [`set:${KDS_IDB_FLAG_KEY}`, `remove:${STATE_KEY}`, `remove:${PUSHED_KEY}`]);
});

test("durable-copy: a stored copy wins over legacy keys, which are then removed", async () => {
  const store = createMemoryKeyValueStore({
    state: { text: "stored-text", id: "tabB:4" },
    pushed: { map: { b: "h2" }, stateId: "tabB:4" },
  });
  const legacy = fakeLegacy(LEGACY);
  const loaded = await open(store, legacy).ready;

  assert.deepEqual(loaded, { mode: "idb", text: "stored-text", record: { b: "h2" } });
  assert.equal(store.writes, 0);
  assert.equal(legacy.values.get(KDS_IDB_FLAG_KEY), "1");
  assert.equal(legacy.values.has(STATE_KEY) || legacy.values.has(PUSHED_KEY), false);
});

test("durable-copy: an open past the budget falls back to legacy and closes the late store", async () => {
  const store = createMemoryKeyValueStore();
  let closed = 0;
  const lateStore: KeyValueStore = { update: store.update, close() { closed += 1; } };
  const legacy = fakeLegacy(LEGACY);
  const slowOpen = () => new Promise<KeyValueStore>(resolve => setTimeout(() => resolve(lateStore), 60));
  const copy = openDurableCopy({ openStore: slowOpen, legacy, tabId: "tabA", budgetMs: 20 });

  assert.deepEqual(await copy.ready, { mode: "fallback-legacy", text: "legacy-text", record: { a: "h1" } });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(closed, 1);
  assert.equal(await copy.commit({}, "x", {}), false);
  assert.equal(await copy.commitRecord({}, {}), false);
  assert.equal(store.writes, 0);
});

test("durable-copy: a flagged origin falls back without reading the legacy keys", async () => {
  const legacy = fakeLegacy({ ...LEGACY, [KDS_IDB_FLAG_KEY]: "1" });
  legacy.calls.length = 0;
  const failing = () => Promise.reject(new Error("blocked"));
  const copy = openDurableCopy({ openStore: failing, legacy, tabId: "tabA", budgetMs: 20 });

  assert.deepEqual(await copy.ready, { mode: "fallback-flagged", text: null, record: {} });
  assert.equal(legacy.calls.some(call => call.includes(STATE_KEY) || call.includes(PUSHED_KEY)), false);
  assert.equal(await copy.commit({}, "x", {}), false);
});

test("durable-copy: a readiness transaction slower than the budget falls back and never writes", async () => {
  const store = createMemoryKeyValueStore();
  store.delayMs = 80;
  const legacy = fakeLegacy(LEGACY);
  const copy = open(store, legacy, "tabA", 20);

  assert.equal((await copy.ready).mode, "fallback-legacy");
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(store.writes, 0);
  assert.equal(legacy.values.has(STATE_KEY), true);
});

test("durable-copy: a commit before ready writes nothing", async () => {
  const store = createMemoryKeyValueStore();
  store.delayMs = 10;
  const copy = open(store, fakeLegacy());
  const early = copy.commit({}, "early", {});

  assert.equal(await early, false);
  await copy.ready;
  assert.equal(store.writes, 0);
});

test("durable-copy: a commit stores one id on both keys, unique per commit and per tab", async () => {
  const store = createMemoryKeyValueStore();
  const copy = open(store, fakeLegacy(), "tabA");
  await copy.ready;
  const ids: string[] = [];
  for (const text of ["one", "two"]) {
    assert.equal(await copy.commit({}, text, { k: text }), true);
    const { id } = stored(store, "state") as { id: string };
    assert.equal(stored(store, "pushed").stateId, id);
    ids.push(id);
  }
  assert.notEqual(ids[0], ids[1]);
  assert.ok(ids.every(id => id.includes("tabA")));

  const otherStore = createMemoryKeyValueStore();
  const second = open(otherStore, fakeLegacy(), "tabB");
  await second.ready;
  await second.commit({}, "one", {});
  assert.ok(!ids.includes((stored(otherStore, "state") as { id: string }).id));
});

test("durable-copy: commitRecord writes the record alone when the live state is the committed one", async () => {
  const store = createMemoryKeyValueStore();
  const copy = open(store, fakeLegacy());
  await copy.ready;
  const ref = {};
  await copy.commit(ref, "text", { a: "1" });
  const before = stored(store, "state");

  assert.equal(await copy.commitRecord(ref, { a: "2" }), true);
  assert.equal(stored(store, "state"), before);
  assert.deepEqual(stored(store, "pushed"), { map: { a: "2" }, stateId: (before as { id: string }).id });
});

test("durable-copy: commitRecord refuses a ref that is not the committed one", async () => {
  const store = createMemoryKeyValueStore();
  const copy = open(store, fakeLegacy());
  await copy.ready;
  await copy.commit({}, "text", {});
  const writes = store.writes;

  assert.equal(await copy.commitRecord({}, { a: "2" }), false);
  assert.equal(store.writes, writes);
});

test("durable-copy: commitRecord refuses while a commit is in flight", async () => {
  const store = createMemoryKeyValueStore();
  const copy = open(store, fakeLegacy());
  await copy.ready;
  const ref = {};
  await copy.commit(ref, "one", {});
  const inFlight = copy.commit({}, "two", {});

  assert.equal(await copy.commitRecord(ref, { a: "2" }), false);
  await inFlight;
});

test("durable-copy: commitRecord refuses after a failed commit until a later one succeeds", async () => {
  const store = createMemoryKeyValueStore();
  const copy = open(store, fakeLegacy());
  await copy.ready;
  const ref = {};
  await copy.commit(ref, "one", { a: "1" });
  store.failWrites = true;
  assert.equal(await copy.commit(ref, "two", { a: "2" }), false);
  assert.equal(await copy.commitRecord(ref, { a: "3" }), false);
  store.failWrites = false;
  assert.equal(await copy.commit(ref, "three", { a: "3" }), true);
  assert.equal(await copy.commitRecord(ref, { a: "4" }), true);
});

test("durable-copy: commitRecord refuses when another tab committed after us", async () => {
  const store = createMemoryKeyValueStore();
  const tabA = open(store, fakeLegacy(), "tabA");
  const tabB = open(store, fakeLegacy(), "tabB");
  await Promise.all([tabA.ready, tabB.ready]);
  const ref = {};
  await tabA.commit(ref, "from A", {});
  await tabB.commit({}, "from B", {});
  const writes = store.writes;

  assert.equal(await tabA.commitRecord(ref, { a: "1" }), false);
  assert.equal(store.writes, writes);
});

test("durable-copy: a failed commit leaves the previous pair intact", async () => {
  const store = createMemoryKeyValueStore();
  const copy = open(store, fakeLegacy());
  await copy.ready;
  await copy.commit({}, "kept", { a: "1" });
  const pair = [stored(store, "state"), stored(store, "pushed")];
  store.failWrites = true;

  assert.equal(await copy.commit({}, "lost", { a: "2" }), false);
  assert.deepEqual([stored(store, "state"), stored(store, "pushed")], pair);
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function slowCompletion(store: MemoryKeyValueStore, extraMs: number): KeyValueStore {
  return {
    close: () => store.close(),
    update: (keys, change, options) => store.update(keys, change, options).then(async result => {
      await sleep(extraMs);
      return result;
    }),
  };
}

test("durable-copy: a migration the budget abandoned leaves the legacy keys and the flag alone", async () => {
  const store = createMemoryKeyValueStore();
  const legacy = fakeLegacy(LEGACY);
  const copy = openDurableCopy({ openStore: async () => slowCompletion(store, 80), legacy, tabId: "tabA", budgetMs: 20 });

  assert.equal((await copy.ready).mode, "fallback-legacy");
  await sleep(150);
  assert.equal(legacy.values.has(KDS_IDB_FLAG_KEY), false);
  assert.equal(legacy.values.get(STATE_KEY), "legacy-text");
  assert.equal(legacy.values.has(PUSHED_KEY), true);
});

test("durable-copy: the next open redoes that migration from the newer legacy copy", async () => {
  const first = createMemoryKeyValueStore();
  await openDurableCopy({ openStore: async () => slowCompletion(first, 80), legacy: fakeLegacy(LEGACY), tabId: "tabA", budgetMs: 20 }).ready;
  await sleep(150);
  const second = createMemoryKeyValueStore(Object.fromEntries(first.entries));
  const newer = fakeLegacy({ [STATE_KEY]: "newer-text", [PUSHED_KEY]: JSON.stringify({ a: "h9" }) });
  const loaded = await open(second, newer).ready;

  assert.deepEqual(loaded, { mode: "idb", text: "newer-text", record: { a: "h9" } });
  assert.deepEqual(stored(second, "state"), { text: "newer-text", id: "migrated" });
  assert.deepEqual(stored(second, "pushed"), { map: { a: "h9" }, stateId: "migrated" });
  assert.equal(newer.values.get(KDS_IDB_FLAG_KEY), "1");
  assert.equal(newer.values.has(STATE_KEY) || newer.values.has(PUSHED_KEY), false);
});

test("durable-copy: a migrated copy whose source was retired keeps the stored copy", async () => {
  const store = createMemoryKeyValueStore({
    state: { text: "stored-text", id: "migrated" },
    pushed: { map: { b: "h2" }, stateId: "migrated" },
  });
  const loaded = await open(store, fakeLegacy({ [KDS_IDB_FLAG_KEY]: "1" })).ready;

  assert.deepEqual(loaded, { mode: "idb", text: "stored-text", record: { b: "h2" } });
  assert.equal(store.writes, 0);
});

test("durable-copy: a non-migrated stored copy wins even when the flag is unset", async () => {
  const store = createMemoryKeyValueStore({
    state: { text: "stored-text", id: "tabX:3" },
    pushed: { map: { b: "h2" }, stateId: "tabX:3" },
  });
  const loaded = await open(store, fakeLegacy(LEGACY)).ready;

  assert.deepEqual(loaded, { mode: "idb", text: "stored-text", record: { b: "h2" } });
  assert.equal(store.writes, 0);
});

// The readiness apply of unload journals (groot ADR 0055 J-C1, J-C3): inside the transaction that
// reads the copy, before memory is replaced, under an ordinary tabId:seq id; journals are removed
// only after that transaction resolved.

import assert from "node:assert/strict";
import test from "node:test";

await import("./support/memory-local-storage.ts");
await import("./support/stub-bridge.ts");
await import("./support/kds-browser.ts");

const kds = await import("./support/kds-tab.ts");
const { openDurableCopy } = await import("../../src/widgets/database-view/model/knownDatabaseDurableCopy.ts");
const { openReadinessJournals } = await import("../../src/widgets/database-view/model/knownDatabaseJournalApply.ts");
const { createMemoryKeyValueStore } = await import("./support/memory-key-value-store.ts");
const { EMPTY, withDb, sliceOf, hashOf, valuesOf, storeWith, storedPair, memoryLegacy } = kds;

const L = withDb(withDb(EMPTY, "db-x", ["a", "b"]), "db-y", ["y-1"]);
const REC = { "db-x": hashOf(L, "db-x"), "db-y": hashOf(L, "db-y") };
const X1 = withDb(L, "db-x", ["a", "b-1"]);
const KEY = (tabId: string) => `osionos.kds.journal.v1.${tabId}`;

function journal(tabId: string, bases: string[], state: typeof L, record: Record<string, string>, writtenAt = 1, deletedPages: string[] = []) {
  return JSON.stringify({ bases, tabId, writtenAt, slices: { "db-x": sliceOf(state, "db-x") }, record, deletedPages });
}

async function ready(storage: ReturnType<typeof memoryLegacy>, store = storeWith(L, REC)) {
  const copy = openDurableCopy({ openStore: async () => store, legacy: memoryLegacy(), tabId: "tab-r", budgetMs: 500, journals: openReadinessJournals(storage) });
  return { copy, store, loaded: await copy.ready.catch(() => null) };
}

test("apply: a journal naming the stored id replaces its databases under an ordinary id of this tab", async () => {
  const storage = memoryLegacy({ [KEY("tab-a")]: journal("tab-a", ["earlier:1"], X1, { "db-x": "acked-x" }) });
  const { copy, store, loaded } = await ready(storage);
  const pair = storedPair(store);
  assert.equal(pair.id, "tab-r:1");
  assert.deepEqual(valuesOf(pair.state, "db-x"), ["a", "b-1"]);
  assert.deepEqual(valuesOf(pair.state, "db-y"), ["y-1"]);
  assert.deepEqual(pair.record, { "db-x": "acked-x", "db-y": REC["db-y"] });
  assert.equal(loaded?.text, (store.entries.get("state") as { text: string }).text);
  assert.equal(copy.ledger().loadedId, "tab-r:1");
  assert.equal(storage.values.size, 0);
});

test("apply: a journal naming another id is not applied, and is removed", async () => {
  const storage = memoryLegacy({ [KEY("tab-a")]: journal("tab-a", ["tab-a:7"], X1, {}) });
  const { copy, store } = await ready(storage);
  assert.equal(store.writes, 0);
  assert.equal(copy.ledger().loadedId, "earlier:1");
  assert.equal(storage.values.size, 0);
});

test("apply: two journals on one database → the later writtenAt wins, whatever the key order", async () => {
  const storage = memoryLegacy({
    [KEY("tab-b")]: journal("tab-b", ["earlier:1"], withDb(L, "db-x", ["late"]), {}, 20),
    [KEY("tab-a")]: journal("tab-a", ["earlier:1"], withDb(L, "db-x", ["early"]), {}, 10),
  });
  const { store } = await ready(storage);
  assert.deepEqual(valuesOf(storedPair(store).state, "db-x"), ["late"]);
});

test("apply: a stored record entry that already acks the journal's slice is kept (T8)", async () => {
  const storage = memoryLegacy({ [KEY("tab-a")]: journal("tab-a", ["earlier:1"], X1, { "db-x": REC["db-x"] }) });
  const { store } = await ready(storage, storeWith(L, { ...REC, "db-x": hashOf(X1, "db-x") }));
  assert.equal(storedPair(store).record["db-x"], hashOf(X1, "db-x"));
});

test("apply: a journal without a record entry for its database drops the stored one", async () => {
  const storage = memoryLegacy({ [KEY("tab-a")]: journal("tab-a", ["earlier:1"], X1, {}) });
  const { store } = await ready(storage);
  assert.deepEqual(storedPair(store).record, { "db-y": REC["db-y"] });
});

test("apply: when the apply commit fails, every journal stays", async () => {
  const raw = journal("tab-a", ["earlier:1"], X1, {});
  const storage = memoryLegacy({ [KEY("tab-a")]: raw, [KEY("tab-z")]: journal("tab-z", ["gone:1"], X1, {}) });
  const store = storeWith(L, REC);
  store.failWrites = true;
  await ready(storage, store);
  assert.equal(storedPair(store).id, "earlier:1");
  assert.equal(storage.values.get(KEY("tab-a")), raw);
  assert.equal(storage.values.size, 2);
});

test("apply: a journal its tab rewrote during readiness is not removed", async () => {
  const storage = memoryLegacy({ [KEY("tab-a")]: journal("tab-a", ["tab-a:3"], X1, {}) });
  const store = storeWith(L, REC);
  store.delayMs = 20;
  const pending = ready(storage, store);
  await new Promise((resolve) => setTimeout(resolve, 30));
  storage.values.set(KEY("tab-a"), "rewritten");
  await pending;
  assert.equal(storage.values.get(KEY("tab-a")), "rewritten");
});

test("apply: an unreadable journal and other keys are ignored, the unreadable one removed", async () => {
  const storage = memoryLegacy({ [KEY("tab-a")]: "{not json", other: "kept", [KEY("tab-b")]: JSON.stringify({ bases: "earlier:1" }) });
  const { store } = await ready(storage);
  assert.equal(storedPair(store).id, "earlier:1");
  assert.deepEqual([...storage.values.keys()], ["other"]);
});

test("apply: the stored deleted pages survive the apply", async () => {
  const storage = memoryLegacy({ [KEY("tab-a")]: journal("tab-a", ["earlier:1"], X1, {}) });
  const text = JSON.stringify({ ...L, deletedPages: ["gone-page"] });
  const store = storeWith(L, REC);
  store.entries.set("state", { text, id: "earlier:1" });
  await ready(storage, store);
  assert.deepEqual(JSON.parse((store.entries.get("state") as { text: string }).text).deletedPages, ["gone-page"]);
});

test("apply: no journals configured → the copy reads as before", async () => {
  const store = storeWith(L, REC);
  const copy = openDurableCopy({ openStore: async () => store, legacy: memoryLegacy(), tabId: "tab-r", budgetMs: 500 });
  await copy.ready;
  assert.equal(store.writes, 0);
  assert.equal(copy.ledger().loadedId, "earlier:1");
});

test("apply: the tombstones of every applied journal are unioned into the stored ones (J-C10)", async () => {
  const stored = JSON.stringify({ ...L, deletedPages: ["kept"] });
  const store = createMemoryKeyValueStore({ state: { text: stored, id: "earlier:1" }, pushed: { map: REC, stateId: "earlier:1" } });
  const storage = memoryLegacy({
    [KEY("tab-a")]: journal("tab-a", ["earlier:1"], X1, REC, 1, ["db-x-r9", "kept"]),
    [KEY("tab-b")]: journal("tab-b", ["earlier:1"], X1, REC, 2, ["db-x-r8"]),
    [KEY("tab-c")]: journal("tab-c", ["other:1"], X1, REC, 3, ["not-applied"]),
  });
  await ready(storage, store);
  const text = (store.entries.get("state") as { text: string }).text;
  assert.deepEqual([...(JSON.parse(text) as { deletedPages: string[] }).deletedPages].sort(), ["db-x-r8", "db-x-r9", "kept"]);
});

test("apply: a journal without its tombstone list is removed unapplied", async () => {
  const bare = JSON.stringify({ bases: ["earlier:1"], tabId: "tab-a", writtenAt: 1, slices: { "db-x": sliceOf(X1, "db-x") }, record: REC });
  const storage = memoryLegacy({ [KEY("tab-a")]: bare });
  const { store } = await ready(storage);
  assert.equal(storedPair(store).id, "earlier:1");
  assert.equal(storage.values.size, 0);
});

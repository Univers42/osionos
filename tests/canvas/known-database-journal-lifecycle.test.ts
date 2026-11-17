// When the unload journal is written and when it goes (groot ADR 0055 J-C4, J-C5), through the
// real unload watcher: at hidden and again at pagehide, gone once the tab is visible again, and an
// unload whose journal cannot be stored sends no pagehide push.

import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { DurableCopy } from "../../src/widgets/database-view/model/knownDatabaseDurableCopy.ts";

await import("./support/memory-local-storage.ts");
await import("./support/stub-bridge.ts");
await import("./support/kds-browser.ts");

const kds = await import("./support/kds-tab.ts");
const { createMemoryKeyValueStore } = await import("./support/memory-key-value-store.ts");
const { EMPTY, withDb, sliceOf, hashOf, valuesOf, settle, storeWith, memoryLegacy, openTab, reload, useBridge } = kds;

const X = withDb(EMPTY, "db-x", ["a", "b"]);
const OWN_KEY = "osionos.kds.journal.v1.tab-a";

async function freshTab(t: TestContext, options: Parameters<typeof openTab>[1] = {}) {
  const bridge = useBridge(t, { "db-x": sliceOf(X, "db-x") });
  const store = storeWith(X, { "db-x": hashOf(X, "db-x") });
  const legacy = memoryLegacy();
  const tab = openTab(store, { ...options, legacy });
  await tab.persistence.ready;
  await tab.hydrate();
  await settle();
  bridge.posts = [];
  return { bridge, store, legacy, tab };
}

const serverValues = (bridge: ReturnType<typeof useBridge>) => valuesOf(bridge.server.get("db-x"), "db-x");

// Firefox tab close: the write at hidden survives, the one at pagehide does not. A writer that only
// runs at pagehide loses the offline edit.
test("lifecycle: the journal written at hidden carries an offline edit through a lost pagehide write", async (t) => {
  const { bridge, store, legacy, tab } = await freshTab(t);
  bridge.failPosts = true; store.failWrites = true;
  tab.edit("db-x", ["a", "b-1"]);
  tab.hide(); await settle();
  legacy.dropWrites = true;
  tab.pagehide(); await settle();
  legacy.dropWrites = false; bridge.failPosts = false;
  await reload(store, legacy);
  assert.deepEqual(serverValues(bridge), ["a", "b-1"]);
});

test("lifecycle: a tab that becomes visible again removes its own journal, and only its own", async (t) => {
  const { legacy, tab } = await freshTab(t);
  legacy.values.set("osionos.kds.journal.v1.tab-other", "theirs");
  tab.edit("db-x", ["a", "b-1"]);
  tab.hide();
  assert.ok(legacy.values.has(OWN_KEY));
  tab.show();
  assert.equal(legacy.values.has(OWN_KEY), false);
  assert.equal(legacy.values.get("osionos.kds.journal.v1.tab-other"), "theirs");
});

test("lifecycle: hidden, visible, then an edit whose commit fails while its push lands → nothing older applies", async (t) => {
  const { bridge, store, legacy, tab } = await freshTab(t);
  const release = bridge.hold();
  store.failWrites = true;
  tab.edit("db-x", ["a", "b-1"]);
  tab.hide(); await settle(); // commit fails, push of b-1 held
  tab.show();
  release(); await settle();
  tab.edit("db-x", ["a", "b-2"]); tab.flush(); await settle(); // commit fails, push of b-2 lands
  assert.deepEqual(serverValues(bridge), ["a", "b-2"]);
  store.failWrites = false;
  await reload(store, legacy);
  assert.deepEqual(serverValues(bridge), ["a", "b-2"], "a journal older than the server was applied");
});

test("lifecycle: an unchanged state at pagehide is not written again", async (t) => {
  const { legacy, tab } = await freshTab(t);
  tab.edit("db-x", ["a", "b-1"]);
  tab.hide();
  const written = legacy.values.get(OWN_KEY);
  legacy.values.set(OWN_KEY, "untouched");
  tab.pagehide();
  assert.ok(written);
  assert.equal(legacy.values.get(OWN_KEY), "untouched");
});

test("lifecycle: an unload over the 1,000,000-character cap stores no journal and sends no push", async (t) => {
  const { bridge, legacy, tab } = await freshTab(t);
  tab.edit("db-x", ["a", "€".repeat(500_001)]);
  tab.pagehide(); await settle();
  assert.equal(legacy.values.has(OWN_KEY), false);
  assert.deepEqual(bridge.posts, []);
});

test("lifecycle: an unload whose journal the origin refuses stores nothing and sends no push", async (t) => {
  const { bridge, legacy, tab } = await freshTab(t);
  tab.edit("db-x", ["a", "b-1"]);
  tab.hide(); await settle(); // the hidden flush's own push runs before the unload
  legacy.refuseWrites = true;
  tab.edit("db-x", ["a", "b-2"]);
  tab.pagehide(); await settle();
  assert.equal(legacy.values.has(OWN_KEY), false);
  assert.deepEqual(bridge.posts.filter((post) => valuesOf(post.state, "db-x").includes("b-2")), []);
});

// JM1: only the writer reads the ledger, so the push itself still works; under "a throwing writer
// allows the push" it sends b-1 with no journal behind it (N2).
test("lifecycle: a journal writer that throws at pagehide stores nothing and sends no push", async (t) => {
  let isBroken = false;
  const ledgerThrows = (copy: DurableCopy): DurableCopy => ({
    ...copy,
    ledger: () => { if (isBroken) throw new Error("ledger unreadable"); return copy.ledger(); },
  });
  const { bridge, legacy, tab } = await freshTab(t, { wrapDurable: ledgerThrows });
  tab.edit("db-x", ["a", "b-1"]);
  isBroken = true; tab.pagehide(); await settle();
  assert.equal(legacy.values.has(OWN_KEY), false);
  assert.deepEqual(bridge.posts, []);
});

test("lifecycle: a session on the legacy copy writes no journal", async (t) => {
  useBridge(t, { "db-x": sliceOf(X, "db-x") });
  const legacy = memoryLegacy();
  const tab = openTab(createMemoryKeyValueStore(), { legacy, isUnavailable: true });
  await tab.persistence.ready;
  assert.equal(tab.persistence.mode(), "fallback-legacy");
  tab.edit("db-x", ["a", "b-1"]);
  tab.hide(); tab.pagehide();
  assert.deepEqual([...legacy.values.keys()].filter((key) => key.startsWith("osionos.kds.journal")), []);
});

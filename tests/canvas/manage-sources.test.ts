/* ************************************************************************** */
/*  manage-sources.test.ts — container sources, locks, db meta, view links   */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  listDatabaseSources, linkSource, renameSource, removeSource,
} from "../../src/shared/notion-database-sys/src/store/sources/manageSourcesModel.ts";
import {
  loadDbMeta, saveDbMeta, applyStoredDbMeta, updateDatabaseMeta,
} from "../../src/shared/notion-database-sys/src/store/sources/dbMetaPersistence.ts";
import { isDatabaseLocked, isViewLocked } from "../../src/shared/notion-database-sys/src/lib/lockGuards.ts";
import { viewLinkFromHref } from "../../src/shared/notion-database-sys/src/lib/viewLink.ts";
import type {
  DatabaseSchema, ViewConfig,
} from "../../src/shared/notion-database-sys/src/component/types.ts";

function makeDb(id: string, extra: Partial<DatabaseSchema> = {}): DatabaseSchema {
  return {
    id, name: `${id} name`, titlePropertyId: "t",
    properties: { t: { id: "t", name: "Name", type: "title" } },
    ...extra,
  };
}

function makeView(id: string, databaseId: string, extra: Partial<ViewConfig> = {}): ViewConfig {
  return {
    id, databaseId, name: `view ${id}`, type: "table",
    filters: [], filterConjunction: "and", sorts: [],
    visibleProperties: ["t"], settings: {},
    ...extra,
  };
}

test("manage-sources: listing unions primary, linked and derived sources", () => {
  const db = makeDb("main", {
    dataSources: [{ id: "baas:x:orders", name: "Orders", kind: "live" }],
  });
  const views = {
    v1: makeView("v1", "main"),
    v2: makeView("v2", "db-crm"),                  // derived via rebind
    v3: makeView("v3", "baas:x:orders"),           // uses the linked source
  };
  const entries = listDatabaseSources(db, views, { "db-crm": makeDb("db-crm") });
  const byId = new Map(entries.map(e => [e.ref.id, e]));
  assert.equal(byId.get("main")?.isPrimary, true);
  assert.deepEqual(byId.get("main")?.usedBy, ["view v1"]);
  assert.equal(byId.get("baas:x:orders")?.isLinked, true);
  assert.deepEqual(byId.get("baas:x:orders")?.usedBy, ["view v3"]);
  assert.equal(byId.get("db-crm")?.isLinked, false);
  assert.equal(byId.get("db-crm")?.ref.name, "db-crm name");
  assert.equal(byId.get("db-crm")?.ref.kind, "known");
});

test("manage-sources: linkSource is idempotent and refuses self-links", () => {
  const db = makeDb("main");
  const linked = linkSource(db, { id: "baas:x:t", name: "T", kind: "live" });
  assert.equal(linked.dataSources?.length, 1);
  assert.ok(linked.dataSources?.[0].addedAt, "stamps addedAt");
  assert.equal(linkSource(linked, { id: "baas:x:t", name: "T", kind: "live" }), linked);
  assert.equal(linkSource(db, { id: "main", name: "self", kind: "known" }), db);
});

test("manage-sources: rename aliases the ref; remove is blocked while in use", () => {
  const db = linkSource(makeDb("main"), { id: "s1", name: "Old", kind: "known" });
  assert.equal(renameSource(db, "s1", "New").dataSources?.[0].name, "New");
  const inUse = { v: makeView("v", "s1") };
  assert.equal(removeSource(db, "s1", inUse), null);
  const removed = removeSource(db, "s1", {});
  assert.deepEqual(removed?.dataSources, []);
});

test("db-meta: localStorage write-through round-trips and prunes empties", () => {
  const storage = new Map<string, string>();
  (globalThis as Record<string, unknown>).window = globalThis;
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  };
  try {
    saveDbMeta("db1", { locked: true });
    assert.deepEqual(loadDbMeta("db1"), { locked: true });

    const state = { databases: { db1: makeDb("db1") }, pages: {}, views: {} };
    const applied = applyStoredDbMeta(state);
    assert.equal(applied.databases.db1.locked, true);

    saveDbMeta("db1", {});                                  // prune
    assert.equal(loadDbMeta("db1"), null);
    assert.equal(applyStoredDbMeta(state), state, "no meta → same reference");

    // updateDatabaseMeta: store + write-through in one call
    let committed: Record<string, DatabaseSchema> | null = null;
    const store = {
      getState: () => ({ databases: { db1: makeDb("db1") } }),
      setState: (partial: { databases: Record<string, DatabaseSchema> }) => { committed = partial.databases; },
    };
    updateDatabaseMeta(store, "db1", { locked: true });
    assert.equal(committed!.db1.locked, true);
    assert.deepEqual(loadDbMeta("db1"), { locked: true });
  } finally {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).localStorage;
  }
});

test("lock-guards: view lock and database lock compose", () => {
  const db = makeDb("d", { locked: true });
  assert.equal(isDatabaseLocked(db), true);
  assert.equal(isDatabaseLocked(makeDb("d")), false);
  assert.equal(isViewLocked(makeView("v", "d"), db), true);
  assert.equal(isViewLocked(makeView("v", "d", { settings: { locked: true } }), null), true);
  assert.equal(isViewLocked(makeView("v", "d"), makeDb("d")), false);
});

test("view-link: sets and replaces the view param, keeps the rest", () => {
  assert.equal(
    viewLinkFromHref("https://app.local/?home=database", "v-abc"),
    "https://app.local/?home=database&view=v-abc",
  );
  assert.equal(
    viewLinkFromHref("https://app.local/?home=database&view=old#hash", "v-new"),
    "https://app.local/?home=database&view=v-new#hash",
  );
});

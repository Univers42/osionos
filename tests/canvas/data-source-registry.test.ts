/* ************************************************************************** */
/*  data-source-registry.test.ts — provider registry + bindViewSource        */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  registerDataSourceProvider, listRegisteredDataSources, loadRegisteredDataSource,
  type DataSourceProvider,
} from "../../src/shared/notion-database-sys/src/store/sources/dataSourceRegistry.ts";
import {
  bindViewSource, type SourceBindStore,
} from "../../src/shared/notion-database-sys/src/store/sources/bindViewSource.ts";
import type {
  DatabaseSchema, NotionState, ViewConfig,
} from "../../src/shared/notion-database-sys/src/component/types.ts";

function provider(overrides: Partial<DataSourceProvider>): DataSourceProvider {
  return {
    listSources: async () => [],
    loadDatabase: async () => null,
    ...overrides,
  };
}

function makeDb(id: string): DatabaseSchema {
  return {
    id, name: id, titlePropertyId: "t",
    properties: { t: { id: "t", name: "Name", type: "title" } },
  };
}

function makeStore(state: NotionState & { views: Record<string, ViewConfig> }): SourceBindStore & {
  commits: object[];
} {
  const commits: object[] = [];
  let current = state;
  return {
    commits,
    getState: () => current,
    setState: (partial) => {
      commits.push(partial);
      current = { ...current, ...partial } as typeof current;
    },
  };
}

test("registry: providers compose, duplicate ids keep the first descriptor", async () => {
  registerDataSourceProvider(null);
  registerDataSourceProvider(provider({
    listSources: async () => [{ id: "a", name: "A-first", group: "g1" }],
  }));
  registerDataSourceProvider(provider({
    listSources: async () => [
      { id: "a", name: "A-second", group: "g2" },
      { id: "b", name: "B", group: "g2" },
    ],
  }));
  const catalog = await listRegisteredDataSources();
  assert.deepEqual(catalog.map(s => `${s.id}:${s.name}`), ["a:A-first", "b:B"]);
  registerDataSourceProvider(null);
});

test("registry: a broken provider is isolated", async () => {
  registerDataSourceProvider(null);
  registerDataSourceProvider(provider({ listSources: async () => { throw new Error("boom"); } }));
  registerDataSourceProvider(provider({
    listSources: async () => [{ id: "ok", name: "OK", group: "g" }],
  }));
  const catalog = await listRegisteredDataSources();
  assert.deepEqual(catalog.map(s => s.id), ["ok"]);
  registerDataSourceProvider(null);
});

test("registry: loadRegisteredDataSource asks providers in order", async () => {
  registerDataSourceProvider(null);
  registerDataSourceProvider(provider({
    loadDatabase: async (id) => (id === "mine"
      ? { databases: { mine: makeDb("mine") }, pages: {} }
      : null),
  }));
  assert.equal((await loadRegisteredDataSource("mine"))?.databases.mine.id, "mine");
  assert.equal(await loadRegisteredDataSource("other"), null);
  registerDataSourceProvider(null);
});

test("bindViewSource: merges the loaded slice and rebinds the view", async () => {
  registerDataSourceProvider(null);
  const newDb = makeDb("target");
  registerDataSourceProvider(provider({
    loadDatabase: async (id) => (id === "target" ? {
      databases: { target: newDb },
      pages: {
        "target:r1": {
          id: "target:r1", databaseId: "target", properties: { t: "Row" },
          content: [], createdAt: "", updatedAt: "", createdBy: "", lastEditedBy: "",
        },
      },
    } : null),
  }));
  const store = makeStore({
    databases: { origin: makeDb("origin") },
    pages: {},
    views: {
      v1: {
        id: "v1", databaseId: "origin", name: "V", type: "table",
        filters: [], filterConjunction: "and", sorts: [],
        visibleProperties: ["t"], settings: {},
      },
    },
  });
  const changed = await bindViewSource(store, "v1", "target");
  assert.equal(changed, true);
  assert.equal(store.commits.length, 1);
  const next = store.getState();
  assert.equal(next.views.v1.databaseId, "target");
  assert.ok(next.databases.origin, "origin database stays in the store");
  assert.ok(next.databases.target);
  assert.ok(next.pages["target:r1"]);
  assert.ok(!("activeViewId" in store.commits[0]), "never touches activeViewId");
  registerDataSourceProvider(null);
});

test("bindViewSource: no-ops on same source or unknown view", async () => {
  registerDataSourceProvider(null);
  const store = makeStore({
    databases: { origin: makeDb("origin") },
    pages: {},
    views: {
      v1: {
        id: "v1", databaseId: "origin", name: "V", type: "table",
        filters: [], filterConjunction: "and", sorts: [],
        visibleProperties: [], settings: {},
      },
    },
  });
  assert.equal(await bindViewSource(store, "v1", "origin"), false);
  assert.equal(await bindViewSource(store, "ghost", "origin"), false);
  assert.equal(store.commits.length, 0);
});

test("bindViewSource: unknown source rejects without committing", async () => {
  registerDataSourceProvider(null);
  const store = makeStore({
    databases: { origin: makeDb("origin") },
    pages: {},
    views: {
      v1: {
        id: "v1", databaseId: "origin", name: "V", type: "table",
        filters: [], filterConjunction: "and", sorts: [],
        visibleProperties: [], settings: {},
      },
    },
  });
  await assert.rejects(() => bindViewSource(store, "v1", "nowhere"));
  assert.equal(store.commits.length, 0);
});

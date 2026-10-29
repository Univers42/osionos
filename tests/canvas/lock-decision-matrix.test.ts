/* ************************************************************************** */
/*  lock-decision-matrix.test.ts — what each lock refuses, action by action:  */
/*  a locked view refuses its own config, a locked database refuses its       */
/*  schema too, and cell values stay editable under both. Same answers        */
/*  whether the host manages the lock or not.                                 */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { createDatabaseStore } from "../../src/shared/notion-database-sys/src/store/useDatabaseStore.ts";
import { applyStoredDbMeta, updateDatabaseMeta } from "../../src/shared/notion-database-sys/src/store/sources/dbMetaPersistence.ts";
import { bindViewSource } from "../../src/shared/notion-database-sys/src/store/sources/bindViewSource.ts";
import type { DatabaseSchema, ViewConfig } from "../../src/shared/notion-database-sys/src/types/database.ts";

// Switching the active view (deleteView, addView) writes the URL hash.
Object.assign(globalThis, { location: { hash: "" }, history: { replaceState: (): void => undefined } });

type Store = ReturnType<typeof createDatabaseStore>;
type Lock = "unlocked" | "view-locked" | "db-locked";

function makeDb(extra: Partial<DatabaseSchema> = {}): DatabaseSchema {
  return {
    id: "d", name: "Files", titlePropertyId: "t", viewOrder: ["a", "b"],
    properties: {
      t: { id: "t", name: "Name", type: "title" },
      sel: { id: "sel", name: "Kind", type: "select", options: [{ id: "o1", value: "One", color: "gray" }] },
    },
    ...extra,
  } as DatabaseSchema;
}

function makeView(id: string, extra: Partial<ViewConfig> = {}): ViewConfig {
  return {
    id, databaseId: "d", name: `view ${id}`, type: "table",
    filters: [], filterConjunction: "and", sorts: [], visibleProperties: ["t", "sel"], settings: {}, ...extra,
  };
}

const FILTER = { id: "f1", propertyId: "t", operator: "contains", value: "x" } as ViewConfig["filters"][number];
const SORT = { id: "s1", propertyId: "t", direction: "asc" } as ViewConfig["sorts"][number];

function storeFor(lock: Lock, managed: boolean): Store {
  const store = createDatabaseStore();
  const viewSettings = lock === "view-locked" ? { locked: true } : {};
  store.setState({
    databases: { d: makeDb({ locked: lock === "db-locked", locksManagedByHost: managed }) },
    views: { a: makeView("a", { settings: viewSettings, filters: [FILTER], sorts: [SORT] }), b: makeView("b") },
    pages: { p: { id: "p", databaseId: "d", properties: { t: "Row" }, createdAt: "", updatedAt: "" } },
    activeDbmsSource: "adapter",
  } as never);
  return store;
}

const snapshot = (store: Store) => {
  const { databases, views, pages } = store.getState();
  return JSON.stringify({ databases, views, pages });
};

// Every action targets view "a", the one a view lock covers.
const VIEW_EDITS: Record<string, (s: Store) => void> = {
  addFilter: s => s.getState().addFilter("a", { propertyId: "t", operator: "contains", value: "x" } as never),
  updateView: s => s.getState().updateView("a", { name: "Renamed" }),
  updateFilter: s => s.getState().updateFilter("a", "f1", { value: "y" }),
  removeFilter: s => s.getState().removeFilter("a", "f1"),
  clearFilters: s => s.getState().clearFilters("a"),
  addSort: s => s.getState().addSort("a", { propertyId: "sel", direction: "desc" }),
  updateSort: s => s.getState().updateSort("a", "s1", { direction: "desc" }),
  removeSort: s => s.getState().removeSort("a", "s1"),
  hideAllProperties: s => s.getState().hideAllProperties("a"),
  reorderProperties: s => s.getState().reorderProperties("a", ["sel", "t"]),
  setGrouping: s => s.getState().setGrouping("a", { propertyId: "sel" } as never),
  togglePropertyVisibility: s => s.getState().togglePropertyVisibility("a", "sel"),
  updateViewSettings: s => s.getState().updateViewSettings("a", { wrapContent: true }),
  deleteView: s => s.getState().deleteView("a"),
};
const SCHEMA_EDITS: Record<string, (s: Store) => void> = {
  renameDatabase: s => s.getState().renameDatabase("d", "Renamed"),
  updateDatabaseIcon: s => s.getState().updateDatabaseIcon("d", "📚"),
  setDefaultTemplate: s => s.getState().setDefaultTemplate("d", "tpl"),
  reorderViews: s => s.getState().reorderViews("d", ["b", "a"]),
  updateProperty: s => s.getState().updateProperty("d", "sel", { name: "Type" }),
  insertPropertyAt: s => s.getState().insertPropertyAt("d", "Due", "date", "a", "t"),
  duplicateProperty: s => s.getState().duplicateProperty("d", "sel", "a"),
  saveDatabaseAutomations: s => s.getState().saveDatabaseAutomations("d", []),
  addProperty: s => { s.getState().addProperty("d", "Due", "date"); },
  deleteProperty: s => s.getState().deleteProperty("d", "sel"),
  addView: s => { s.getState().addView({ ...makeView("x"), id: undefined } as never); },
  duplicateView: s => s.getState().duplicateView("a"),
};
const VALUE_EDITS: Record<string, (s: Store) => void> = {
  addSelectOption: s => s.getState().addSelectOption("d", "sel", { id: "o2", value: "Two", color: "blue" } as never),
  updatePageProperty: s => s.getState().updatePageProperty("p", "sel", "o1"),
  addPage: s => { s.getState().addPage("d"); },
};

const EXPECTED: Record<Lock, { view: boolean; schema: boolean; value: boolean }> = {
  unlocked: { view: true, schema: true, value: true },
  "view-locked": { view: false, schema: true, value: true },
  "db-locked": { view: false, schema: false, value: true },
};

for (const managed of [false, true]) {
  for (const lock of Object.keys(EXPECTED) as Lock[]) {
    test(`${lock}, ${managed ? "host-managed" : "plain"} lock: each action passes or is refused`, () => {
      const groups = [[VIEW_EDITS, EXPECTED[lock].view], [SCHEMA_EDITS, EXPECTED[lock].schema], [VALUE_EDITS, EXPECTED[lock].value]] as const;
      for (const [actions, allowed] of groups) {
        for (const [name, act] of Object.entries(actions)) {
          const store = storeFor(lock, managed);
          const before = snapshot(store);
          act(store);
          assert.equal(snapshot(store) !== before, allowed, `${name} should ${allowed ? "apply" : "be refused"}`);
        }
      }
    });
  }
}

test("a plain lock, once lifted, lets the edit through", () => {
  const view = storeFor("view-locked", false);
  view.getState().updateViewSettings("a", { locked: false });
  VIEW_EDITS.addFilter(view);
  assert.equal(view.getState().views.a.filters.length, 2);

  const database = storeFor("db-locked", false);
  updateDatabaseMeta(database, "d", { locked: false });
  SCHEMA_EDITS.renameDatabase(database);
  assert.equal(database.getState().databases.d.name, "Renamed");
});

test("a lock stored on this device is honoured unless the host manages the lock", () => {
  const stored = new Map([["nds:dbmeta:d", JSON.stringify({ locked: true })]]);
  const localStorage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (): void => undefined, removeItem: (): void => undefined };
  Object.assign(globalThis, { window: globalThis, localStorage });
  try {
    const lockedOf = (managed: boolean) =>
      applyStoredDbMeta({ databases: { d: makeDb({ locksManagedByHost: managed }) }, pages: {}, views: {} } as never).databases.d.locked;
    assert.equal(lockedOf(false), true);
    assert.equal(lockedOf(true), undefined);
  } finally {
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("the viewer cannot set a host-managed database lock, nor change a locked database's sources", () => {
  const managed = storeFor("unlocked", true);
  updateDatabaseMeta(managed, "d", { locked: true });
  assert.equal(managed.getState().databases.d.locked, false);

  const locked = storeFor("db-locked", false);
  updateDatabaseMeta(locked, "d", { dataSources: [{ id: "elsewhere" }] as never });
  assert.equal(locked.getState().databases.d.dataSources, undefined);
});

test("a new or duplicated view in a host-managed database does not carry the host's lock", () => {
  const store = storeFor("view-locked", true);
  const added = store.getState().addView({ ...makeView("x", { settings: { locked: true } }), id: undefined } as never);
  assert.equal(store.getState().views[added].settings?.locked, undefined);
  store.getState().duplicateView("a");
  const copy = Object.values(store.getState().views).find(v => !["a", "b", added].includes(v.id));
  assert.ok(copy, "the duplicate exists");
  assert.equal(copy.settings?.locked, undefined);

  const plain = storeFor("view-locked", false);
  plain.getState().duplicateView("a");
  const plainCopy = Object.values(plain.getState().views).find(v => !["a", "b"].includes(v.id));
  assert.equal(plainCopy?.settings?.locked, true);
});

test("a locked view keeps its data source; an open one asks the providers for the new one", async () => {
  const locked = storeFor("view-locked", false);
  assert.equal(await bindViewSource(locked, "a", "elsewhere"), false);
  assert.equal(locked.getState().views.a.databaseId, "d");

  // No provider serves "elsewhere": reaching the load is what an open view proves.
  const open = storeFor("unlocked", false);
  await assert.rejects(bindViewSource(open, "a", "elsewhere"), /not available/);
});

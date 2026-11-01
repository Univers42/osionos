// A SQL view of a mount reads like a table and takes no write (#263).

import assert from "node:assert/strict";
import test from "node:test";

import { buildLiveDatabase } from "../../src/shared/notion-database-sys/src/store/live/liveStateBuilder.ts";
import { createDatabaseStore } from "../../src/shared/notion-database-sys/src/store/useDatabaseStore.ts";

// Creating a store reads the URL hash.
Object.assign(globalThis, { location: { hash: "", search: "" }, history: { replaceState: (): void => undefined } });

function storeWith(readOnly: boolean) {
  const store = createDatabaseStore();
  store.setState({
    databases: { d: { id: "d", name: "V", icon: "", properties: { t: { id: "t", name: "T", type: "title" } }, titlePropertyId: "t", readOnly } },
    views: {},
    pages: { p: { id: "p", databaseId: "d", properties: { t: "Row" }, createdAt: "", updatedAt: "" } },
    activeDbmsSource: "adapter",
  } as never);
  return store;
}

test("the gateway's flag reaches the database", () => {
  const table = { name: "v_pnl_by_month", primary_key: [], columns: [{ name: "month", type: "text", nullable: true }], read_only: true };
  const database = buildLiveDatabase(table as never, { dbId: "db", table: table.name });
  assert.equal(database.readOnly, true);
  const base = buildLiveDatabase({ ...table, read_only: undefined } as never, { dbId: "db", table: table.name });
  assert.equal(base.readOnly, undefined);
});

test("every page action refuses a read-only source", () => {
  const store = storeWith(true);
  const before = store.getState().pages;
  store.getState().updatePageProperty("p", "t", "changed");
  assert.equal(store.getState().addPage("d"), "");
  store.getState().deletePage("p");
  store.getState().duplicatePage("p");
  assert.equal(store.getState().pages, before);
});

test("a normal source still takes edits, and a host reload still lands on a view", () => {
  const store = storeWith(false);
  store.getState().updatePageProperty("p", "t", "changed");
  assert.equal(store.getState().pages.p.properties.t, "changed");
  const view = storeWith(true);
  view.setState({ pages: {} } as never);
  assert.deepEqual(view.getState().pages, {});
});

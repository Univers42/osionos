/* A live database whose table the server does not have is a state of the block, not an outage:
 * the data plane answers 400 with the engine's own wording, and the pane must say which table. */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AdapterError } from "../../src/shared/notion-database-sys/src/component/types.ts";
import {
  TableNotFoundError,
  isTableMissingMessage,
  toTableNotFound,
} from "../../src/shared/notion-database-sys/src/store/live/liveTableMissing.ts";
import { ObjectDatabaseError } from "../../src/shared/notion-database-sys/src/components/ObjectDatabaseError.tsx";

const WORDINGS = {
  sqlite: "invalid request: sqlite: no such table: dish",
  postgres: 'invalid request: relation "dish" does not exist',
  mysql: "invalid request: Table 'ops.dish' doesn't exist",
};

test("isTableMissingMessage recognises the sqlite, postgres and mysql wordings", () => {
  for (const [engine, message] of Object.entries(WORDINGS)) assert.ok(isTableMissingMessage(message), engine);
});

test("isTableMissingMessage leaves other failures alone", () => {
  for (const message of ["no such column: ghost", 'column "x" does not exist', "network blip", "", undefined]) {
    assert.ok(!isTableMissingMessage(message), String(message));
  }
});

test("toTableNotFound turns a 400 with a missing-table message into the named state", () => {
  for (const message of Object.values(WORDINGS)) {
    const mapped = toTableNotFound(new AdapterError(message, 400, "/p"), "db-1", "dish");
    assert.ok(mapped instanceof TableNotFoundError);
    assert.equal(mapped.table, "dish");
    assert.equal(mapped.code, "TABLE_NOT_FOUND");
  }
});

test("toTableNotFound ignores other statuses and other messages", () => {
  assert.equal(toTableNotFound(new AdapterError(WORDINGS.sqlite, 502, "/p"), "db-1", "dish"), null);
  assert.equal(toTableNotFound(new AdapterError("bad filter", 400, "/p"), "db-1", "dish"), null);
  assert.equal(toTableNotFound(new Error(WORDINGS.sqlite), "db-1", "dish"), null);
  assert.equal(toTableNotFound(null, "db-1", "dish"), null);
});

test("the pane says Table not found, names the table and what the owner can do", () => {
  const html = renderToStaticMarkup(React.createElement(ObjectDatabaseError, {
    label: "osionos-restaurant", message: "ignored", tableMissing: "dish", onRetry: () => {},
  }));
  assert.match(html, /role="alert"/);
  assert.match(html, /Table not found/);
  assert.match(html, /dish/);
  assert.match(html, /point the database at an existing table or remove it/);
  assert.doesNotMatch(html, /Failed to load/);
});

test("the pane keeps the generic failure when no table is missing", () => {
  const html = renderToStaticMarkup(React.createElement(ObjectDatabaseError, {
    label: null, message: "boom", tableMissing: null, onRetry: () => {},
  }));
  assert.match(html, /Failed to load this database/);
  assert.match(html, /boom/);
});

test("toTableNotFound keeps a message that names another table generic", () => {
  for (const message of [
    "invalid request: sqlite: no such table: other",
    'invalid request: relation "other" does not exist',
    "invalid request: Table 'ops.other' doesn't exist",
  ]) {
    assert.equal(toTableNotFound(new AdapterError(message, 400, "/p"), "db-1", "dish"), null, message);
  }
  const qualified = new AdapterError("invalid request: Table 'ops.dish' doesn't exist", 400, "/p");
  assert.ok(toTableNotFound(qualified, "db-1", "dish"), "schema-qualified name still matches");
});

// Store path: stub adapter -> loadAdapterState -> dbmsTableMissing. The adapter's own
// `.catch -> toTableNotFound` is not reachable here: liveMountClient reads VITE_API_URL from
// import.meta.env at module load, which node does not provide, so every request throws
// NOT_CONFIGURED before any fetch stub is consulted.
const { createDatabaseStore } = await import("../../src/shared/notion-database-sys/src/store/useDatabaseStore.ts");
const { loadAdapterState } = await import("../../src/shared/notion-database-sys/src/object_database.tsx");

function stubAdapter(loads: Array<() => Promise<unknown>>) {
  return { loadState: () => (loads.shift() as () => Promise<unknown>)() } as never;
}
// A successful load reads and writes the URL hash for the active source; node has no location.
(globalThis as { location?: unknown }).location ??= { hash: "" };
(globalThis as { history?: unknown }).history ??= { replaceState: () => {} };
const okState = async () => ({ databases: {}, pages: {}, views: {} });

test("a TableNotFoundError load reaches the store, and a later good load clears it", async () => {
  const store = createDatabaseStore();
  const adapter = stubAdapter([
    async () => { throw new TableNotFoundError("dish", "db-1"); },
    okState,
  ]);
  assert.equal(await loadAdapterState(store, adapter), null);
  assert.equal(store.getState().dbmsTableMissing, "dish");
  assert.match(store.getState().dbmsError ?? "", /dish/);
  const second = await loadAdapterState(store, adapter);
  assert.equal(second, "adapter", String(store.getState().dbmsError));
  assert.equal(store.getState().dbmsTableMissing, null);
  assert.equal(store.getState().dbmsError, null);
});

test("a generic failure after a missing table replaces it; a silent failure leaves it", async () => {
  const store = createDatabaseStore();
  const adapter = stubAdapter([
    async () => { throw new TableNotFoundError("dish", "db-1"); },
    async () => { throw new Error("boom"); },
    async () => { throw new Error("quiet"); },
  ]);
  await loadAdapterState(store, adapter);
  await loadAdapterState(store, adapter);
  assert.equal(store.getState().dbmsTableMissing, null);
  assert.equal(store.getState().dbmsError, "boom");
  await loadAdapterState(store, adapter, { silent: true });
  assert.equal(store.getState().dbmsError, "boom");
});

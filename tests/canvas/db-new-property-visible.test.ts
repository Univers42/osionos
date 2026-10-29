// A property added from one view must show in every view of its database. It used to join
// the active view only, so the other tables, boards and dashboard widgets hid it by default.

import assert from "node:assert/strict";
import test from "node:test";

import { showNewProperty } from "../../src/shared/notion-database-sys/src/store/slices/propertyVisibility.ts";
import type { ViewConfig } from "../../src/shared/notion-database-sys/src/types/database.ts";

function view(id: string, databaseId: string, visibleProperties: string[]): ViewConfig {
  return { id, databaseId, name: id, type: "table", filters: [], filterConjunction: "and", sorts: [], visibleProperties, settings: {} };
}

const views = {
  table: view("table", "db", ["title", "a", "b"]),
  board: view("board", "db", ["title"]),
  other: view("other", "db-2", ["x"]),
};

test("showNewProperty appends to every view of the database, and leaves other databases alone", () => {
  const next = showNewProperty(views, "db", "new");
  assert.deepEqual(next.table.visibleProperties, ["title", "a", "b", "new"]);
  assert.deepEqual(next.board.visibleProperties, ["title", "new"]);
  assert.equal(next.other, views.other);
});

test("showNewProperty places the column where it was asked for in its own view only", () => {
  const afterA = showNewProperty(views, "db", "new", { viewId: "table", after: "a" });
  assert.deepEqual(afterA.table.visibleProperties, ["title", "a", "new", "b"]);
  assert.deepEqual(afterA.board.visibleProperties, ["title", "new"]);
  const first = showNewProperty(views, "db", "new", { viewId: "table", after: null });
  assert.deepEqual(first.table.visibleProperties, ["new", "title", "a", "b"]);
  const missingAnchor = showNewProperty(views, "db", "new", { viewId: "board", after: "a" });
  assert.deepEqual(missingAnchor.board.visibleProperties, ["title", "new"]);
});

test("showNewProperty never lists a property twice", () => {
  const next = showNewProperty(views, "db", "a");
  assert.equal(next.table, views.table);
  assert.deepEqual(next.board.visibleProperties, ["title", "a"]);
});

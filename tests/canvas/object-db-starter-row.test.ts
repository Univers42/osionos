// A block rendered before hydration invents a blank starter row; 2026-11-02 one reached a real
// database on the server through the hydrate union.
import assert from "node:assert/strict";
import test from "node:test";

import { unionSliceFor } from "../../src/widgets/database-view/model/objectDatabaseSlice";

const key = "db";
const page = (id: string, title: string) => ({ id, databaseId: key, properties: { t: title }, content: [] });
const state = (...pages: ReturnType<typeof page>[]) => ({
  databases: { [key]: { id: key, name: "D", icon: "", titlePropertyId: "t", properties: {} } },
  pages: Object.fromEntries(pages.map((item) => [item.id, item])),
  views: {},
}) as never;

test("the invented starter row does not join a database the server holds", () => {
  const union = unionSliceFor(state(page("db-row-1", "")), key, state(page("a", "x"), page("b", "y")));
  assert.deepEqual(Object.keys(union.pages).sort(), ["a", "b"]);
});

test("a starter row with text, or one the server has, stays", () => {
  assert.ok(unionSliceFor(state(page("db-row-1", "typed")), key, state(page("a", "x"))).pages["db-row-1"]);
  assert.ok(unionSliceFor(state(page("db-row-1", "")), key, state(page("db-row-1", ""), page("a", "x"))).pages["db-row-1"]);
});

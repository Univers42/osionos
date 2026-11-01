// A column holding lists reads as tags, and an edit keeps its stored form (#272).

import assert from "node:assert/strict";
import test from "node:test";

import { promoteTagColumns, tagsOfCell } from "../../src/shared/notion-database-sys/src/store/live/liveTagColumns.ts";
import { decodeLiveValue, encodeLiveValue } from "../../src/shared/notion-database-sys/src/store/live/liveValueCodec.ts";

const text = (id: string) => ({ id, name: id, type: "text" });
const MOUNT = { dbId: "db", table: "t" };

test("JSON text and real arrays of short strings are lists", () => {
  assert.deepEqual(tagsOfCell('["read","update"]'), ["read", "update"]);
  assert.deepEqual(tagsOfCell(["a"]), ["a"]);
  for (const other of ["plain", "[not json", "[1,2]", '{"a":1}', 5, [{ a: 1 }], ["x".repeat(41)]]) {
    assert.equal(tagsOfCell(other), null);
  }
});

test("a list column becomes a multi-select whose options are the values seen", () => {
  const properties = { permissions: text("permissions"), slug: text("slug") } as never;
  promoteTagColumns(properties, [
    { permissions: '["read","admin"]', slug: "acme" },
    { permissions: null, slug: "other" },
    { permissions: ["create"], slug: "third" },
  ]);
  const { permissions, slug } = properties as Record<string, { type: string; options?: { id: string }[] }>;
  assert.equal(permissions.type, "multi_select");
  assert.deepEqual(permissions.options?.map((option) => option.id), ["admin", "create", "read"]);
  assert.equal(slug.type, "text");
});

test("one row that is not a list keeps the column as text", () => {
  const properties = { notes: text("notes") } as never;
  promoteTagColumns(properties, [{ notes: '["a"]' }, { notes: "free text" }]);
  assert.equal((properties as Record<string, { type: string }>).notes.type, "text");
});

test("an edit round-trips to the JSON text the column holds", () => {
  const property = { id: "p", name: "p", type: "multi_select", options: [] } as never;
  const json = { name: "p", normalized_type: "json" } as never;
  assert.deepEqual(decodeLiveValue('["a","b"]', property, json, MOUNT), ["a", "b"]);
  assert.equal(encodeLiveValue(["a", "c"], property, json), '["a","c"]');
  assert.deepEqual(encodeLiveValue(["a"], property, { name: "p", normalized_type: "array" } as never), ["a"]);
});

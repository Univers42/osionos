// A column holding lists reads as tags, and an edit keeps its stored form (#272).

import assert from "node:assert/strict";
import test from "node:test";

import { mysqlSetValues, promoteTagColumns, tagsOfCell } from "../../src/shared/notion-database-sys/src/store/live/liveTagColumns.ts";
import { mapLiveColumn } from "../../src/shared/notion-database-sys/src/store/live/liveSchemaMapper.ts";
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

const repeated = (name: string, values: string[], times: number) =>
  Array.from({ length: values.length * times }, (_, index) => ({ [name]: values[index % values.length] }));

test("the schema decides first: MySQL SET is a multi-select of its declared values", () => {
  const column = { name: "flags", native_type: "set('a','b''c')", normalized_type: "text", nullable: true, default: null, enum_values: null, references: null, inferred: false };
  assert.deepEqual(mysqlSetValues(column.native_type), ["a", "b'c"]);
  const property = mapLiveColumn(column as never, "db");
  assert.equal(property.type, "multi_select");
  assert.deepEqual(decodeLiveValue("a,b", property, column as never, MOUNT), ["a", "b"]);
  assert.deepEqual(decodeLiveValue("", property, column as never, MOUNT), []);
  assert.equal(encodeLiveValue(["a", "b"], property, column as never), "a,b");
});

test("an array with no declared values takes its options from the rows", () => {
  const properties = { tags: { id: "tags", name: "tags", type: "multi_select", options: [] } } as never;
  promoteTagColumns(properties, [{ tags: ["x", "y"] }, { tags: ["z"] }]);
  const { tags } = properties as Record<string, { options: { id: string }[] }>;
  assert.deepEqual(tags.options.map((option) => option.id), ["x", "y", "z"]);
});

test("declared options are never replaced by the sample", () => {
  const properties = { tags: { id: "tags", name: "tags", type: "multi_select", options: [{ id: "keep", value: "keep", color: "gray" }] } } as never;
  promoteTagColumns(properties, [{ tags: ["other"] }]);
  assert.equal((properties as Record<string, { options: unknown[] }>).tags.options.length, 1);
});

test("text repeating a few values is a select; free text and names are not", () => {
  const properties = { status: text("status"), slug: text("slug"), few: text("few") } as never;
  const rows = repeated("status", ["open", "paid", "late"], 8).map((row, index) => ({ ...row, slug: `slug-${index}`, few: index < 4 ? "x" : null }));
  promoteTagColumns(properties, rows);
  const { status, slug, few } = properties as Record<string, { type: string; options?: { id: string }[] }>;
  assert.equal(status.type, "select");
  assert.deepEqual(status.options?.map((option) => option.id), ["late", "open", "paid"]);
  assert.equal(slug.type, "text");
  assert.equal(few.type, "text", "too few rows to tell");
});

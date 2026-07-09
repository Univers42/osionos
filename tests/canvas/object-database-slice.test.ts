/* ************************************************************************** */
/*  object-database-slice.test.ts — per-database slice/merge/hash for the     */
/*  server-persistence sync (bridge → Postgres, one row per object database)  */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { NotionState } from "@notion-db/object-database";
import {
  hashSlice,
  sliceDatabase,
  userDatabaseIds,
  withMergedSlice,
  withServerSlice,
} from "../../src/widgets/database-view/model/objectDatabaseSlice.ts";

function fixture(): NotionState {
  return {
    databases: { "db-x": { id: "db-x", name: "X" }, "db-seed": { id: "db-seed", name: "Seed" } },
    pages: {
      p1: { id: "p1", databaseId: "db-x", properties: { title: "one" } },
      p2: { id: "p2", databaseId: "db-x", properties: { title: "two" } },
      s1: { id: "s1", databaseId: "db-seed", properties: {} },
    },
    views: { v1: { id: "v1", databaseId: "db-x" }, vs: { id: "vs", databaseId: "db-seed" } },
  } as unknown as NotionState;
}

test("sliceDatabase carves out only the target database's schema, pages and views", () => {
  const slice = sliceDatabase(fixture(), "db-x");
  assert.deepEqual(Object.keys(slice.databases), ["db-x"]);
  assert.deepEqual(Object.keys(slice.pages).sort(), ["p1", "p2"]);
  assert.deepEqual(Object.keys(slice.views), ["v1"]);
});

test("userDatabaseIds excludes code-shipped seed ids", () => {
  assert.deepEqual(userDatabaseIds(fixture(), new Set(["db-seed"])), ["db-x"]);
  assert.deepEqual(userDatabaseIds(fixture(), new Set(["db-x", "db-seed"])), []);
});

test("withServerSlice replaces one database's slice and leaves the rest untouched", () => {
  const server = {
    databases: { "db-x": { id: "db-x", name: "X (server)" } },
    // server has p1 (edited) + p3 (new); p2 was deleted server-side → must drop locally
    pages: {
      p1: { id: "p1", databaseId: "db-x", properties: { title: "one!" } },
      p3: { id: "p3", databaseId: "db-x", properties: { title: "three" } },
    },
    views: { v1: { id: "v1", databaseId: "db-x" } },
  } as unknown as NotionState;

  const merged = withServerSlice(fixture(), "db-x", server);
  assert.equal((merged.databases["db-x"] as { name: string }).name, "X (server)");
  assert.deepEqual(Object.keys(merged.pages).sort(), ["p1", "p3", "s1"]); // p2 dropped, p3 added, seed's s1 kept
  assert.equal((merged.pages.p1 as { properties: { title: string } }).properties.title, "one!");
  assert.equal((merged.databases["db-seed"] as { name: string }).name, "Seed"); // untouched
});

test("withMergedSlice: a fresh empty placeholder can NEVER erase real server data", () => {
  // Regression guard for the db-daf0ffc2 loss: a browser auto-created an empty
  // placeholder for a database whose real 6-record copy lived on the server.
  // The union must keep every server record and adopt the server's richer name.
  const local = {
    databases: { "db-daf0ffc2": { id: "db-daf0ffc2", name: "Untitled database" } },
    pages: { "db-daf0ffc2-row-1": { id: "db-daf0ffc2-row-1", databaseId: "db-daf0ffc2", properties: {} } },
    views: { "db-daf0ffc2-table": { id: "db-daf0ffc2-table", databaseId: "db-daf0ffc2" } },
  } as unknown as NotionState;
  const server = {
    databases: { "db-daf0ffc2": { id: "db-daf0ffc2", name: "something" } },
    pages: Object.fromEntries(
      ["a", "b", "c", "d", "e", "f"].map((k) => [`row-${k}`, { id: `row-${k}`, databaseId: "db-daf0ffc2", properties: { title: k } }]),
    ),
    views: { "view-server": { id: "view-server", databaseId: "db-daf0ffc2" } },
  } as unknown as NotionState;

  const merged = withMergedSlice(local, "db-daf0ffc2", server);
  const pageIds = Object.keys(merged.pages);
  for (const k of ["a", "b", "c", "d", "e", "f"]) assert.ok(pageIds.includes(`row-${k}`), `server record row-${k} must survive`);
  assert.equal((merged.databases["db-daf0ffc2"] as { name: string }).name, "something"); // richer side's name wins
});

test("withMergedSlice: neither genuine local edits nor server-only records are lost", () => {
  const local = {
    databases: { "db-x": { id: "db-x", name: "X local" } },
    pages: {
      p1: { id: "p1", databaseId: "db-x", properties: { v: "local1" } },
      p2: { id: "p2", databaseId: "db-x", properties: { v: "local2" } },
      p3: { id: "p3", databaseId: "db-x", properties: { v: "local3" } },
    },
    views: {},
  } as unknown as NotionState;
  const server = {
    databases: { "db-x": { id: "db-x", name: "X server" } },
    pages: {
      p1: { id: "p1", databaseId: "db-x", properties: { v: "server1" } }, // collision
      pS: { id: "pS", databaseId: "db-x", properties: { v: "serverOnly" } }, // server-only
    },
    views: {},
  } as unknown as NotionState;

  const merged = withMergedSlice(local, "db-x", server);
  assert.deepEqual(Object.keys(merged.pages).sort(), ["p1", "p2", "p3", "pS"]); // server-only record added, none dropped
  // local has more records → it is the base and wins the p1 collision (the active edit)
  assert.equal((merged.pages.p1 as { properties: { v: string } }).properties.v, "local1");
});

test("hashSlice is key-order stable and content-sensitive", () => {
  const a = hashSlice({ databases: { d: { b: 1, a: 2 } }, pages: {}, views: {} } as unknown as NotionState);
  const b = hashSlice({ databases: { d: { a: 2, b: 1 } }, pages: {}, views: {} } as unknown as NotionState);
  assert.equal(a, b, "reordered keys hash equal (no spurious re-push after a pull)");

  const changed = hashSlice({ databases: { d: { a: 2, b: 9 } }, pages: {}, views: {} } as unknown as NotionState);
  assert.notEqual(a, changed, "a real value change flips the hash");
});

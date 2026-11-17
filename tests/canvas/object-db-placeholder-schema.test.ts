// A database block can invent a one-column schema before the server's real schema arrives.
import assert from "node:assert/strict";
import test from "node:test";

import type { NotionState } from "@notion-db/object-database";
import { reconcileServerDatabases, type ReconcileInput } from "../../src/widgets/database-view/model/objectDatabaseReconcile.ts";
import { hashSlice, isPlaceholderSchema, sliceDatabase, unionSliceFor } from "../../src/widgets/database-view/model/objectDatabaseSlice.ts";

const key = "db-s";

type Definition = {
  id: string;
  name: string;
  titlePropertyId: string;
  properties: Record<string, { id: string; name: string; type: string }>;
};
type Row = { id: string; databaseId: string; properties: Record<string, string>; content: unknown[] };

function definition(columnIds: string[], titlePropertyId = columnIds[0]): Definition {
  return {
    id: key,
    name: "Untitled database",
    titlePropertyId,
    properties: Object.fromEntries(columnIds.map((id, index) => [id, { id, name: index === 0 ? "Name" : id, type: index === 0 ? "title" : "text" }])),
  };
}

function state(database: Definition | undefined, pages: Row[], views: Record<string, unknown>): NotionState {
  return {
    databases: database ? { [key]: database } : {},
    pages: Object.fromEntries(pages.map((page) => [page.id, page])),
    views,
  } as unknown as NotionState;
}

function placeholder(title = ""): NotionState {
  const localDefinition = { ...definition([`${key}-title`]), titlePropertyId: `${key}-title` };
  const row = { id: `${key}-row-1`, databaseId: key, properties: { [`${key}-title`]: title }, content: [] };
  return state(localDefinition, [row], { [`${key}-v`]: { id: `${key}-v`, databaseId: key, name: "Table", type: "table" } });
}

const server = () => state(
  definition(Array.from({ length: 9 }, (_, index) => `c${index}`), "c0"),
  [],
  { "srv-v": { id: "srv-v", databaseId: key, name: "Board", type: "board" } },
);

function pull(live: NotionState, pushed: ReconcileInput["pushed"] = {}) {
  const rows = new Map([[key, server()]]);
  return reconcileServerDatabases({ live, server: rows, pushed, deletedPageIds: new Set() });
}

test("a pristine placeholder takes the clean server schema and no starter row", () => {
  const result = pull(placeholder());
  assert.equal(Object.keys(result.merged.databases[key].properties).length, 9);
  assert.deepEqual(Object.keys(sliceDatabase(result.merged, key).views), ["srv-v"]);
  assert.deepEqual(Object.keys(sliceDatabase(result.merged, key).pages), []);
  assert.equal(result.nextPushed[key], hashSlice(sliceDatabase(result.merged, key)));
});

test("editing a new row after the pull cannot restore the placeholder schema", () => {
  const first = pull(placeholder());
  const row = { id: `${key}-row-2`, databaseId: key, properties: { c0: "typed" }, content: [] };
  const edited = { ...first.merged, pages: { ...first.merged.pages, [row.id]: row } } as NotionState;
  const result = pull(edited, first.nextPushed);
  assert.equal(Object.keys(result.merged.databases[key].properties).length, 9);
});

test("a typed placeholder row is re-keyed to the server title and pushed back", () => {
  const result = pull(placeholder("typed"));
  assert.equal(Object.keys(result.merged.databases[key].properties).length, 9);
  assert.deepEqual(Object.keys(sliceDatabase(result.merged, key).views), ["srv-v"]);
  assert.deepEqual(result.merged.pages[`${key}-row-1`].properties, { c0: "typed" });
  assert.equal(key in result.nextPushed, false);
});

test("two one-column schemas keep the unchanged local-base rule", () => {
  const local = state(definition(["local-title"]), [
    { id: "local-row", databaseId: key, properties: { "local-title": "local" }, content: [] },
  ], {});
  const remote = state(definition(["server-title"]), [], {});
  const union = unionSliceFor(local, key, remote);
  assert.deepEqual(union, local);
  assert.equal(union.databases[key], local.databases[key]);
});

test("a local three-column schema is not a placeholder", () => {
  const local = state(definition(["c0", "c1", "c2"]), [
    { id: "row-1", databaseId: key, properties: { c0: "one" }, content: [] },
    { id: "row-2", databaseId: key, properties: { c0: "two" }, content: [] },
  ], {});
  const union = unionSliceFor(local, key, server());
  assert.equal(union.databases[key], local.databases[key]);
});

test("placeholder schema detection checks local and server column counts", () => {
  const cases: [number | undefined, number | undefined, boolean][] = [
    [1, 9, true], [undefined, 2, true], [1, 1, false], [2, 9, false], [1, undefined, false],
  ];
  for (const [localColumns, serverColumns, expected] of cases) {
    const local = state(localColumns === undefined ? undefined : definition(Array.from({ length: localColumns }, (_, index) => `l${index}`)), [], {});
    const remote = state(serverColumns === undefined ? undefined : definition(Array.from({ length: serverColumns }, (_, index) => `s${index}`)), [], {});
    assert.equal(isPlaceholderSchema(key, local, remote), expected);
  }
});

test("a server row whose state has no parts is not a placeholder match", () => {
  assert.equal(isPlaceholderSchema(key, state(definition(["l0"]), [], {}), {} as NotionState), false);
});

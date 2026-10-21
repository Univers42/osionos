/* ************************************************************************** */
/*  row-delete-persists.test.ts — a deleted row must not come back on reload. */
/*                                                                            */
/*  The snapshot used to carry no record of deletions, so loading it over the */
/*  code seed (and, above all, the server union) could only see "page absent"  */
/*  and filled it back in. Deletions are now persisted as tombstones next to   */
/*  the snapshot and honoured by every merge.                                  */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { NotionState } from "@notion-db/object-database";
import {
  deletedPageIdsBetween,
  loadPersistedKnownDatabaseState,
  serializeKnownDatabaseState,
} from "../../src/widgets/database-view/model/knownDatabasePersistedState.ts";
import {
  sliceDatabase,
  withMergedSlice,
  withServerSlice,
} from "../../src/widgets/database-view/model/objectDatabaseSlice.ts";

function page(id: string, databaseId: string, title: string, createdAt = "2026-10-20T23:34:18.192Z") {
  return {
    id,
    databaseId,
    properties: { title },
    content: [],
    createdAt,
    updatedAt: createdAt,
    createdBy: "You",
    lastEditedBy: "You",
  };
}

function database(id: string, name: string) {
  return {
    id,
    name,
    titlePropertyId: `${id}-title`,
    properties: { [`${id}-title`]: { id: `${id}-title`, name: "Name", type: "title" } },
  };
}

function view(id: string, databaseId: string) {
  return {
    id,
    databaseId,
    name: "Table",
    type: "table",
    filters: [],
    filterConjunction: "and",
    sorts: [],
    visibleProperties: [`${databaseId}-title`],
    settings: {},
  };
}

function userRows(): NotionState {
  return {
    databases: { "db-deals": database("db-deals", "Deals") },
    pages: {
      "db-deals-row-1": page("db-deals-row-1", "db-deals", "A"),
      "db-deals-row-2": page("db-deals-row-2", "db-deals", "B"),
    },
    views: { "db-deals-table": view("db-deals-table", "db-deals") },
  } as unknown as NotionState;
}

function emptySeed(): NotionState {
  return { databases: {}, pages: {}, views: {} } as unknown as NotionState;
}

test("persist → delete B → persist → load: B stays gone, A is intact", () => {
  const before = userRows();
  const flushBefore = serializeKnownDatabaseState(before, new Set());
  const loadedBefore = loadPersistedKnownDatabaseState(flushBefore, emptySeed());
  assert.deepEqual(Object.keys(loadedBefore.state.pages).sort(), ["db-deals-row-1", "db-deals-row-2"]);

  // What the host does on delete: drop B, diff against the baseline, persist.
  const afterDelete: NotionState = {
    ...loadedBefore.state,
    pages: { "db-deals-row-1": loadedBefore.state.pages["db-deals-row-1"] },
  };
  const tombstones = deletedPageIdsBetween(loadedBefore.state, afterDelete);
  assert.deepEqual([...tombstones], ["db-deals-row-2"]);
  const flushAfter = serializeKnownDatabaseState(afterDelete, tombstones);

  const loadedAfter = loadPersistedKnownDatabaseState(flushAfter, emptySeed());
  assert.equal(loadedAfter.state.pages["db-deals-row-2"], undefined, "deleted row must not come back");
  assert.ok(loadedAfter.state.pages["db-deals-row-1"], "surviving row must stay");
  assert.equal(loadedAfter.state.pages["db-deals-row-1"].properties.title, "A");
  assert.equal(loadedAfter.state.pages["db-deals-row-1"].createdAt, "2026-10-20T23:34:18.192Z");
  assert.deepEqual([...loadedAfter.deletedPageIds], ["db-deals-row-2"], "tombstone is readable after load");
});

test("old snapshots (no tombstone field) keep loading unchanged", () => {
  const oldFormat = JSON.stringify(userRows());
  assert.equal("deletedPages" in JSON.parse(oldFormat), false);

  const loaded = loadPersistedKnownDatabaseState(oldFormat, emptySeed());
  assert.deepEqual(Object.keys(loaded.state.pages).sort(), ["db-deals-row-1", "db-deals-row-2"]);
  assert.equal(loaded.deletedPageIds.size, 0);
});

test("the server union does not resurrect a row deleted before its push landed", () => {
  const local = {
    databases: { "db-deals": database("db-deals", "Deals") },
    pages: { "db-deals-row-1": page("db-deals-row-1", "db-deals", "A") },
    views: { "db-deals-table": view("db-deals-table", "db-deals") },
  } as unknown as NotionState;
  // The server still has B: the local delete happened but its (debounced,
  // fire-and-forget) push never completed before the reload.
  const server = userRows();
  const tombstones = new Set(["db-deals-row-2"]);

  // Guard the mechanism: without tombstones the union *does* resurrect B.
  const naive = withMergedSlice(local, "db-deals", server);
  assert.ok(naive.pages["db-deals-row-2"], "fixture proves the union would re-add B");

  const union = withMergedSlice(local, "db-deals", server, tombstones);
  assert.equal(union.pages["db-deals-row-2"], undefined, "union must honour the deletion");
  assert.ok(union.pages["db-deals-row-1"]);

  const replaced = withServerSlice(local, "db-deals", server, tombstones);
  assert.equal(replaced.pages["db-deals-row-2"], undefined, "server replacement must honour the deletion");
  assert.ok(replaced.pages["db-deals-row-1"]);
  assert.deepEqual(Object.keys(sliceDatabase(union, "db-deals").pages), ["db-deals-row-1"]);
});

test("a deleted seed starter row is not re-added by the code-seed union", () => {
  const seeded = {
    databases: { "db-acts": database("db-acts", "Activities") },
    pages: { "db-acts-row-1": page("db-acts-row-1", "db-acts", "") },
    views: { "db-acts-table": view("db-acts-table", "db-acts") },
  } as unknown as NotionState;
  // The user deleted the starter row; the snapshot has no pages left.
  const stored = { databases: {}, pages: {}, views: {} } as unknown as NotionState;
  const raw = serializeKnownDatabaseState(stored, new Set(["db-acts-row-1"]));

  const loaded = loadPersistedKnownDatabaseState(raw, seeded);
  assert.equal(loaded.state.pages["db-acts-row-1"], undefined, "seed must not resurrect the deleted row");
  assert.ok(loaded.state.databases["db-acts"], "the rest of the seed database still loads");
});

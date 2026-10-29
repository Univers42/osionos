/* ************************************************************************** */
/*  object-database-reconcile.test.ts — the one-pass pull decides exactly as  */
/*  the per-database loop it replaced, on random accounts                     */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { NotionState } from "@notion-db/object-database";
import { reconcileServerDatabases, type ReconcileInput } from "../../src/widgets/database-view/model/objectDatabaseReconcile.ts";
import {
  hashSlice,
  sliceAllDatabases,
  sliceDatabase,
  withMergedSlice,
  withServerSlice,
} from "../../src/widgets/database-view/model/objectDatabaseSlice.ts";

/** The loop `hydrate` ran before the one-pass rewrite: each server row laid
 *  down on the whole state in turn. */
function sequentialReconcile({ live, server, pushed, deletedPageIds }: ReconcileInput) {
  let merged = live;
  let changed = false;
  const nextPushed: Record<string, string> = { ...pushed };
  for (const [dbKey, serverState] of server) {
    const localHash = hashSlice(sliceDatabase(merged, dbKey));
    if (merged.databases[dbKey] && pushed[dbKey] !== localHash) {
      const union = withMergedSlice(merged, dbKey, serverState, deletedPageIds);
      delete nextPushed[dbKey];
      if (hashSlice(sliceDatabase(union, dbKey)) !== localHash) { merged = union; changed = true; }
      continue;
    }
    const candidate = withServerSlice(merged, dbKey, serverState, deletedPageIds);
    const serverHash = hashSlice(sliceDatabase(candidate, dbKey));
    nextPushed[dbKey] = serverHash;
    if (serverHash !== localHash) { merged = candidate; changed = true; }
  }
  return { merged, changed, nextPushed };
}

function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

type Mutable = { databases: Record<string, unknown>; pages: Record<string, unknown>; views: Record<string, unknown> };

/** A random account: databases clean, dirty, untracked, local-only and
 *  server-only; server rows without a schema; colliding row ids; tombstones. */
function randomInput(seed: number): ReconcileInput {
  const rand = prng(seed);
  const pick = (n: number) => Math.floor(rand() * n);
  const live: Mutable = { databases: {}, pages: {}, views: {} };
  const server = new Map<string, NotionState>();
  const pushed: Record<string, string> = {};
  const deletedPageIds = new Set<string>();
  const dbCount = 1 + pick(7);
  for (let d = 0; d < dbCount; d += 1) {
    const dbKey = `db-${d}`;
    const kind = pick(5); // 0 clean, 1 dirty, 2 untracked, 3 local-only, 4 server-only
    if (kind !== 4) {
      live.databases[dbKey] = { id: dbKey, name: `L${d}` };
      live.views[`${dbKey}-v`] = { id: `${dbKey}-v`, databaseId: dbKey, name: "local" };
      for (let r = 0; r < pick(6); r += 1) live.pages[`${dbKey}-r${r}`] = { id: `${dbKey}-r${r}`, databaseId: dbKey, properties: { t: `l${r}` } };
    }
    if (kind === 3) continue;
    const row: Mutable = { databases: {}, pages: {}, views: {} };
    if (rand() < 0.8) row.databases[dbKey] = { id: dbKey, name: kind === 0 ? `L${d}` : `S${d}` };
    row.views[`${dbKey}-v`] = { id: `${dbKey}-v`, databaseId: dbKey, name: kind === 0 ? "local" : "server" };
    const start = kind === 0 ? 0 : pick(4);
    for (let r = start; r < start + pick(6); r += 1) row.pages[`${dbKey}-r${r}`] = { id: `${dbKey}-r${r}`, databaseId: dbKey, properties: { t: `s${r}` } };
    if (rand() < 0.3) row.pages[`${dbKey}-x`] = { id: `${dbKey}-x`, databaseId: dbKey, properties: {} };
    if (rand() < 0.3) deletedPageIds.add(`${dbKey}-x`);
    server.set(dbKey, row as unknown as NotionState);
    const localSlice = sliceDatabase(live as unknown as NotionState, dbKey);
    if (kind === 0) pushed[dbKey] = hashSlice(localSlice);
    if (kind === 1) pushed[dbKey] = "stale";
  }
  return { live: live as unknown as NotionState, server, pushed, deletedPageIds };
}

/** Per database: same content, same row order. Cross-database key order is not
 *  part of the contract (every view reads one database). */
function assertSameState(actual: NotionState, expected: NotionState, seed: number): void {
  const a = sliceAllDatabases(actual);
  const e = sliceAllDatabases(expected);
  assert.deepEqual([...a.keys()].sort(), [...e.keys()].sort(), `seed ${seed}: database keys`);
  for (const [dbKey, slice] of e) {
    const got = a.get(dbKey)!;
    assert.deepEqual(got, slice, `seed ${seed}: ${dbKey} content`);
    assert.deepEqual(Object.keys(got.pages), Object.keys(slice.pages), `seed ${seed}: ${dbKey} row order`);
  }
}

test("one-pass reconcile matches the per-database loop on 500 random accounts", () => {
  for (let seed = 1; seed <= 500; seed += 1) {
    const input = randomInput(seed);
    const expected = sequentialReconcile(input);
    const actual = reconcileServerDatabases(input);
    assert.equal(actual.changed, expected.changed, `seed ${seed}: changed`);
    assert.deepEqual(actual.nextPushed, expected.nextPushed, `seed ${seed}: push baseline`);
    assertSameState(actual.merged, expected.merged, seed);
  }
});

test("a pull that changes nothing hands back the same state object", () => {
  const live = { databases: { "db-a": { id: "db-a" } }, pages: { p: { id: "p", databaseId: "db-a" } }, views: {} } as unknown as NotionState;
  const server = new Map([["db-a", sliceDatabase(live, "db-a")]]);
  const result = reconcileServerDatabases({ live, server, pushed: { "db-a": hashSlice(sliceDatabase(live, "db-a")) }, deletedPageIds: new Set() });
  assert.equal(result.merged, live);
  assert.equal(result.changed, false);
});

test("an empty server list keeps every local database untouched", () => {
  const live = { databases: { "db-a": { id: "db-a" } }, pages: {}, views: {} } as unknown as NotionState;
  const result = reconcileServerDatabases({ live, server: new Map(), pushed: {}, deletedPageIds: new Set() });
  assert.equal(result.merged, live);
  assert.deepEqual(result.nextPushed, {});
});

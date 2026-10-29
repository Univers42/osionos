/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   objectDatabaseSlice.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/08 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Pure helpers that carve one database out of the monolithic NotionState and
// splice a server copy back in. The bridge stores ONE row per database (its
// schema + views + records), so the client must slice the shared state by
// `databaseId` on the way out and merge per-database on the way back — with no
// I/O, so this stays unit-testable in isolation (see the self-check at bottom).

import type { NotionState } from "@notion-db/object-database";

type Owned = { databaseId?: string };

const NO_DELETED_PAGES: ReadonlySet<string> = new Set();

export function emptySlice(): NotionState {
  return { databases: {}, pages: {}, views: {} } as NotionState;
}

/** Copy of `slice` without tombstoned pages (same ref when there are none). */
function withoutPages(slice: NotionState, deletedPageIds: ReadonlySet<string>): NotionState {
  if (deletedPageIds.size === 0) return slice;
  const pages: NotionState["pages"] = {};
  let dropped = false;
  for (const [id, page] of Object.entries(slice.pages)) {
    if (deletedPageIds.has(id)) dropped = true;
    else pages[id] = page;
  }
  return dropped ? { ...slice, pages } : slice;
}

/** Everything belonging to one database: its schema entry, its record pages and
 *  its views — the unit the bridge persists as a single row's `state`. */
export function sliceDatabase(state: NotionState, dbKey: string): NotionState {
  const slice = emptySlice();
  const database = state.databases[dbKey];
  if (database) slice.databases[dbKey] = database;
  for (const [pageId, page] of Object.entries(state.pages)) {
    if ((page as Owned).databaseId === dbKey) slice.pages[pageId] = page;
  }
  for (const [viewId, view] of Object.entries(state.views)) {
    if ((view as Owned).databaseId === dbKey) slice.views[viewId] = view;
  }
  return slice;
}

/** Every database's slice in one pass over the pages and views: O(pages + views),
 *  where calling `sliceDatabase` once per database is O(databases × pages)
 *  (163 ms per flush on an 83-database, 8,646-row account, object-database-sync.bench.ts). */
export function sliceAllDatabases(state: NotionState): Map<string, NotionState> {
  const slices = new Map<string, NotionState>();
  const sliceOf = (dbKey: string): NotionState => {
    let slice = slices.get(dbKey);
    if (!slice) slices.set(dbKey, (slice = emptySlice()));
    return slice;
  };
  for (const [dbKey, database] of Object.entries(state.databases)) {
    if (database) sliceOf(dbKey).databases[dbKey] = database;
  }
  for (const [pageId, page] of Object.entries(state.pages)) {
    const dbKey = (page as Owned).databaseId;
    if (dbKey) sliceOf(dbKey).pages[pageId] = page;
  }
  for (const [viewId, view] of Object.entries(state.views)) {
    const dbKey = (view as Owned).databaseId;
    if (dbKey) sliceOf(dbKey).views[viewId] = view;
  }
  return slices;
}

/** The slice the server's copy makes of one database (server is the source of
 *  truth for it): its schema (the local one when the server row has none), its
 *  pages and its views. Tombstoned pages are never laid down: a local delete
 *  outranks a stale server copy (the delete may not have reached the server
 *  before a reload). */
export function serverSliceFor(
  local: NotionState,
  dbKey: string,
  server: NotionState,
  deletedPageIds: ReadonlySet<string> = NO_DELETED_PAGES,
): NotionState {
  const slice = emptySlice();
  const definition = server.databases?.[dbKey] ?? local.databases[dbKey];
  if (definition) slice.databases[dbKey] = definition;
  for (const [id, page] of Object.entries(server.pages ?? {})) {
    if ((page as Owned).databaseId === dbKey && !deletedPageIds.has(id)) slice.pages[id] = page;
  }
  for (const [id, view] of Object.entries(server.views ?? {})) {
    if ((view as Owned).databaseId === dbKey) slice.views[id] = view;
  }
  return slice;
}

/** Union of one database's local slice with the server's copy so NEITHER side
 *  loses a record. Used when local is dirty/untracked and can't be trusted to
 *  replace the server wholesale — it may be genuine offline edits, OR a fresh
 *  empty placeholder a browser auto-created before the server copy arrived (the
 *  latter used to overwrite real data). The side with MORE records is the base
 *  and wins id collisions (its schema/views win too); the other side only fills
 *  in records the base lacks. No page or view owned by `dbKey` is dropped —
 *  except a tombstoned page, which is a deletion, not a record to rescue. */
export function unionSliceFor(
  local: NotionState,
  dbKey: string,
  server: NotionState,
  deletedPageIds: ReadonlySet<string> = NO_DELETED_PAGES,
): NotionState {
  const localSlice = withoutPages(local, deletedPageIds);
  const serverSlice = withoutPages(sliceDatabase(server, dbKey), deletedPageIds);
  const serverIsBase = Object.keys(serverSlice.pages).length > Object.keys(localSlice.pages).length;
  const base = serverIsBase ? serverSlice : localSlice;
  const fill = serverIsBase ? localSlice : serverSlice;
  const slice = emptySlice();
  const definition = base.databases[dbKey] ?? fill.databases[dbKey];
  if (definition) slice.databases[dbKey] = definition;
  slice.pages = { ...fill.pages, ...base.pages };
  slice.views = { ...fill.views, ...base.views };
  return slice;
}

/** `state` with each database in `slices` swapped for its slice, in one pass:
 *  the other databases' pages and views keep their order, the swapped ones are
 *  appended in `slices` order. */
export function withReplacedSlices(state: NotionState, slices: ReadonlyMap<string, NotionState>): NotionState {
  if (slices.size === 0) return state;
  const databases = { ...state.databases };
  const pages: NotionState["pages"] = {};
  const views: NotionState["views"] = {};
  for (const [id, page] of Object.entries(state.pages)) {
    if (!slices.has((page as Owned).databaseId ?? "")) pages[id] = page;
  }
  for (const [id, view] of Object.entries(state.views)) {
    if (!slices.has((view as Owned).databaseId ?? "")) views[id] = view;
  }
  for (const [dbKey, slice] of slices) {
    if (slice.databases[dbKey]) databases[dbKey] = slice.databases[dbKey];
    Object.assign(pages, slice.pages);
    Object.assign(views, slice.views);
  }
  return { databases, pages, views } as NotionState;
}

/** Replace one database's slice in `state` with the server's copy (`serverSliceFor`). */
export function withServerSlice(
  state: NotionState,
  dbKey: string,
  server: NotionState,
  deletedPageIds: ReadonlySet<string> = NO_DELETED_PAGES,
): NotionState {
  return withReplacedSlices(state, new Map([[dbKey, serverSliceFor(sliceDatabase(state, dbKey), dbKey, server, deletedPageIds)]]));
}

/** Union one database's local slice with the server's copy (`unionSliceFor`). */
export function withMergedSlice(
  state: NotionState,
  dbKey: string,
  server: NotionState,
  deletedPageIds: ReadonlySet<string> = NO_DELETED_PAGES,
): NotionState {
  return withReplacedSlices(state, new Map([[dbKey, unionSliceFor(sliceDatabase(state, dbKey), dbKey, server, deletedPageIds)]]));
}

/** Database ids present in `state` that are NOT code-shipped seeds — i.e. the
 *  ones a user actually created (`db-<uuid>`). Only these sync to the server;
 *  the demo seeds regenerate from JSON and would only bloat every account. */
export function userDatabaseIds(state: NotionState, seedIds: ReadonlySet<string>): string[] {
  return Object.keys(state.databases).filter((id) => !seedIds.has(id));
}

/** Deterministic (key-sorted) stringify so a slice hashes the same regardless of
 *  property insertion order — a locally-built slice and the server's echo of it
 *  compare equal, avoiding a spurious re-push after every pull. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.keys(value as Record<string, unknown>).sort();
  const record = value as Record<string, unknown>;
  return `{${entries.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(",")}}`;
}

/** Cheap content hash (djb2) of a slice — the dirty signal for push/pull.
 *  Round-trip + order-stability are proved in tests/canvas/object-database-slice.test.ts */
export function hashSlice(slice: NotionState): string {
  const text = stableStringify(slice);
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

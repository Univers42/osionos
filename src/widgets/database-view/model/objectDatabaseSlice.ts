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

function emptyState(): NotionState {
  return { databases: {}, pages: {}, views: {} } as NotionState;
}

/** Everything belonging to one database: its schema entry, its record pages and
 *  its views — the unit the bridge persists as a single row's `state`. */
export function sliceDatabase(state: NotionState, dbKey: string): NotionState {
  const slice = emptyState();
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

/** Replace one database's slice in `state` with the server's copy (server is the
 *  source of truth for that database): drop the local schema/pages/views owned
 *  by `dbKey`, then lay the server slice's down. Other databases are untouched. */
export function withServerSlice(state: NotionState, dbKey: string, server: NotionState): NotionState {
  const databases = { ...state.databases };
  if (server.databases?.[dbKey]) databases[dbKey] = server.databases[dbKey];

  const pages: NotionState["pages"] = {};
  for (const [id, page] of Object.entries(state.pages)) {
    if ((page as Owned).databaseId !== dbKey) pages[id] = page;
  }
  for (const [id, page] of Object.entries(server.pages ?? {})) {
    if ((page as Owned).databaseId === dbKey) pages[id] = page;
  }

  const views: NotionState["views"] = {};
  for (const [id, view] of Object.entries(state.views)) {
    if ((view as Owned).databaseId !== dbKey) views[id] = view;
  }
  for (const [id, view] of Object.entries(server.views ?? {})) {
    if ((view as Owned).databaseId === dbKey) views[id] = view;
  }

  return { databases, pages, views } as NotionState;
}

/** Union one database's local slice with the server's copy so NEITHER side loses
 *  a record. Used when local is dirty/untracked and can't be trusted to replace
 *  the server wholesale — it may be genuine offline edits, OR a fresh empty
 *  placeholder a browser auto-created before the server copy arrived (the latter
 *  used to overwrite real data). The side with MORE records is the base and wins
 *  id collisions (its schema/views win too); the other side only fills in records
 *  the base lacks. No page or view owned by `dbKey` is ever dropped. */
export function withMergedSlice(state: NotionState, dbKey: string, server: NotionState): NotionState {
  const localSlice = sliceDatabase(state, dbKey);
  const serverSlice = sliceDatabase(server, dbKey);
  const serverIsBase = Object.keys(serverSlice.pages).length > Object.keys(localSlice.pages).length;
  const base = serverIsBase ? serverSlice : localSlice;
  const fill = serverIsBase ? localSlice : serverSlice;

  const databases = { ...state.databases };
  const definition = base.databases[dbKey] ?? fill.databases[dbKey];
  if (definition) databases[dbKey] = definition;

  const pages: NotionState["pages"] = {};
  for (const [id, page] of Object.entries(state.pages)) {
    if ((page as Owned).databaseId !== dbKey) pages[id] = page; // other databases untouched
  }
  for (const [id, page] of Object.entries(fill.pages)) pages[id] = page; // fill first…
  for (const [id, page] of Object.entries(base.pages)) pages[id] = page; // …base wins collisions

  const views: NotionState["views"] = {};
  for (const [id, view] of Object.entries(state.views)) {
    if ((view as Owned).databaseId !== dbKey) views[id] = view;
  }
  for (const [id, view] of Object.entries(fill.views)) views[id] = view;
  for (const [id, view] of Object.entries(base.views)) views[id] = view;

  return { databases, pages, views } as NotionState;
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

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   objectDatabaseReconcile.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The pure half of the object-database pull: decide, per server row, whether the
// local copy is replaced, unioned or kept, then rebuild the state ONCE. Laying
// each row down on the whole state in turn was O(databases × rows): 546 ms for
// an 83-database, 8,646-row account (tests/bench/object-database-sync.bench.ts).

import type { NotionState } from "@notion-db/object-database";
import { emptySlice, hashSlice, serverSliceFor, sliceAllDatabases, unionSliceFor, withReplacedSlices } from "./objectDatabaseSlice";

export interface ReconcileInput {
  /** The local state, tombstoned pages already removed. */
  live: NotionState;
  server: ReadonlyMap<string, NotionState>;
  /** Hash of each database as last pushed: local equals it ⇒ local is clean. */
  pushed: Readonly<Record<string, string>>;
  deletedPageIds: ReadonlySet<string>;
}

export interface ReconcileResult {
  merged: NotionState;
  changed: boolean;
  nextPushed: Record<string, string>;
}

/** The server copy overwrites local ONLY when local is provably our last push.
 *  A dirty or untracked local database is unioned with the server instead and
 *  loses its baseline, so the union is pushed back. */
export function reconcileServerDatabases({ live, server, pushed, deletedPageIds }: ReconcileInput): ReconcileResult {
  const local = sliceAllDatabases(live);
  const nextPushed: Record<string, string> = { ...pushed };
  const replaced = new Map<string, NotionState>();
  for (const [dbKey, serverState] of server) {
    const localSlice = local.get(dbKey) ?? emptySlice();
    const localHash = hashSlice(localSlice);
    if (live.databases[dbKey] && pushed[dbKey] !== localHash) {
      delete nextPushed[dbKey];
      const union = unionSliceFor(localSlice, dbKey, serverState, deletedPageIds);
      if (hashSlice(union) !== localHash) replaced.set(dbKey, union);
      continue;
    }
    const next = serverSliceFor(localSlice, dbKey, serverState, deletedPageIds);
    const serverHash = hashSlice(next);
    nextPushed[dbKey] = serverHash;
    if (serverHash !== localHash) replaced.set(dbKey, next);
  }
  return { merged: withReplacedSlices(live, replaced), changed: replaced.size > 0, nextPushed };
}

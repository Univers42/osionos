/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   knownDatabaseStorage.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The object-database state shares the origin's ~2.62M-character quota with the page caches and
// the outbox: on the live demo origin it was 1.44M of 2.51M, and a pending-pages key that fitted
// without eviction left a 5K database write no room. That write failed silently, and an edit to
// a seed database (never pushed: objectDatabaseSlice userDatabaseIds) was gone at the next load
// (devil D1, 2026-10-14). A refused write now makes room in the page caches, which the server
// rebuilds at every load.
// Ponytail: a state that still does not fit leaves the older copy on disk, and the next load can
// union it over a newer copy already pushed (withMergedSlice: the base wins collisions). That is
// warned about once, and the browser asks before the tab is left.

import { setItemEvictingPageCaches, type PageCacheStorage } from "@/store/pageStore.helpers";
import { createUnloadGuard } from "@/store/sync/pendingPages";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";

export const KNOWN_DATABASE_STATE_STORAGE_KEY = "osionos.knownDatabaseState.v1";

export type KeptStateReport = (isKept: boolean) => void;

/** Reports whether the last write of the state was kept: the first refusal warns once, and a
 *  refused state makes the browser ask before the tab is left. `flushNow` writes any debounced
 *  state at unload, before the guard decides whether the browser must ask. */
export function createKeptStateReporter(flushNow: () => void): KeptStateReport {
  let kept = true;
  let warned = false;
  const guard = createUnloadGuard(globalThis, () => {
    flushNow();
    return kept;
  });
  return (isKept) => {
    kept = isKept;
    if (isKept) {
      guard.disarm();
      return;
    }
    if (!warned) {
      warned = true;
      useToastStore.getState().push({
        kind: "error",
        title: "Browser storage is full",
        description: "Database edits can't be kept across a reload. Keep this tab open; databases you created still sync to the server.",
      });
    }
    guard.arm();
  };
}

/** A writer for the serialized state: false when it could not be kept. */
export function createKnownStateWriter(
  flushNow: () => void,
  storage?: PageCacheStorage,
  report: KeptStateReport = createKeptStateReporter(flushNow),
) {
  return (text: string): boolean => {
    const kept = setItemEvictingPageCaches(KNOWN_DATABASE_STATE_STORAGE_KEY, text, storage);
    report(kept);
    return kept;
  };
}

/** A tab whose browser storage did not answer while this browser's copy lives in IndexedDB
 *  only pulls: anything it wrote or pushed would revert the newer stored copy (devil I7). */
export function warnReadOnlyDatabases(): void {
  useToastStore.getState().push({
    kind: "warning",
    title: "Databases are read-only in this tab",
    description: "Browser storage did not answer, so database edits here could overwrite newer ones. Reload the tab to edit.",
  });
}

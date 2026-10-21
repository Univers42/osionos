/* ************************************************************************** */
/*                                                                            */
/*   knownDatabasePersistedState.ts                                          */
/*                                                                            */
/* Pure load/serialize + deletion tombstones for the known-database snapshot. */
/* Kept free of store/DOM imports so the merge rules are unit-testable.       */
/*                                                                            */
/* ************************************************************************** */

// A page deleted by the user must stay deleted. The snapshot alone cannot
// express that: "absent locally" is also what a fresh browser placeholder looks
// like, and the server sync must keep filling those. So a deletion is written
// next to the snapshot as a tombstone (`deletedPages`), and every merge — the
// code-seed union at load, the server union, the server replacement — drops a
// tombstoned page. The field is additive: a payload without it is the old
// format and loads unchanged, and a snapshot with no deletions is written in
// exactly the old shape.

import type { NotionState } from "@notion-db/object-database";

export type PersistedKnownDatabaseState = Partial<NotionState> & { deletedPages?: unknown };

const NO_DELETED_PAGES: ReadonlySet<string> = new Set();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Tombstones stored with a snapshot; missing/malformed means none (old format). */
export function readDeletedPageIds(stored: unknown): Set<string> {
  if (!isRecord(stored) || !Array.isArray(stored.deletedPages)) return new Set();
  return new Set(stored.deletedPages.filter((id): id is string => typeof id === "string"));
}

/** Page ids present in `previous` and gone from `next` — the user's deletions. */
export function deletedPageIdsBetween(
  previous: Pick<NotionState, "pages">,
  next: Pick<NotionState, "pages">,
): Set<string> {
  const deleted = new Set<string>();
  for (const pageId of Object.keys(previous.pages)) {
    if (!(pageId in next.pages)) deleted.add(pageId);
  }
  return deleted;
}

/** Drop every tombstoned page. Returns the same reference when nothing changes. */
export function withoutDeletedPages(state: NotionState, deletedPageIds: ReadonlySet<string>): NotionState {
  if (deletedPageIds.size === 0) return state;
  let pages: NotionState["pages"] | null = null;
  for (const pageId of Object.keys(state.pages)) {
    if (!deletedPageIds.has(pageId)) continue;
    pages ??= { ...state.pages };
    delete pages[pageId];
  }
  return pages ? { ...state, pages } : state;
}

/** The tombstones that still protect a row: the deleted pages some server slice
 *  still holds. Every other tombstone is confirmed gone and can be dropped.
 *
 *  An EMPTY server input keeps EVERY tombstone: an empty list can mean "not
 *  loaded" (offline, a failed list request), and pruning blind would let a
 *  deleted row come back. O(total server pages): one Set of every server page
 *  id, no nested loops. */
export function tombstonesStillNeeded(
  deleted: ReadonlySet<string>,
  serverStates: Iterable<NotionState>,
): Set<string> {
  const states = [...serverStates];
  if (states.length === 0) return new Set(deleted);
  const serverPageIds = new Set<string>();
  for (const state of states) {
    const pages = state.pages as Record<string, unknown> | undefined;
    for (const pageId of Object.keys(pages ?? {})) serverPageIds.add(pageId);
  }
  const stillNeeded = new Set<string>();
  for (const pageId of deleted) {
    if (serverPageIds.has(pageId)) stillNeeded.add(pageId);
  }
  return stillNeeded;
}

/** Serialize a snapshot with its deletions; no deletions → the exact old format. */
export function serializeKnownDatabaseState(
  state: NotionState,
  deletedPageIds: ReadonlySet<string>,
): string {
  const payload: PersistedKnownDatabaseState = deletedPageIds.size === 0
    ? state
    : { ...state, deletedPages: [...deletedPageIds] };
  return JSON.stringify(payload);
}

/** Stored user state overlaid on the code seed. `stored` wins every id; the seed
 *  only fills what the snapshot lacks (the seed regenerates from code), so a
 *  page the snapshot no longer has stays gone instead of being unioned back. */
export function mergeWithSeedState(
  stored: Partial<NotionState>,
  seeded: NotionState,
  deletedPageIds: ReadonlySet<string> = NO_DELETED_PAGES,
): NotionState {
  const storedDatabases = isRecord(stored.databases) ? stored.databases : {};
  const storedPages = isRecord(stored.pages) ? stored.pages : {};
  const storedViews = isRecord(stored.views) ? stored.views : {};
  return withoutDeletedPages({
    databases: mergeDatabases(seeded.databases, storedDatabases),
    pages: { ...seeded.pages, ...storedPages },
    views: { ...seeded.views, ...storedViews },
  }, deletedPageIds);
}

/** Parse a stored snapshot (old or new format) and return it with its tombstones. */
export function loadPersistedKnownDatabaseState(
  raw: string,
  seeded: NotionState,
): { state: NotionState; deletedPageIds: Set<string> } {
  const stored = JSON.parse(raw) as PersistedKnownDatabaseState;
  const deletedPageIds = readDeletedPageIds(stored);
  return { state: mergeWithSeedState(stored, seeded, deletedPageIds), deletedPageIds };
}

function mergeDatabases(seedDatabases: NotionState["databases"], storedDatabases: NotionState["databases"]): NotionState["databases"] {
  const merged: NotionState["databases"] = { ...seedDatabases };
  for (const [databaseId, database] of Object.entries(storedDatabases)) {
    const seedDatabase = seedDatabases[databaseId];
    merged[databaseId] = seedDatabase
      ? { ...seedDatabase, ...database, properties: { ...seedDatabase.properties, ...database.properties } }
      : database;
  }
  return merged;
}

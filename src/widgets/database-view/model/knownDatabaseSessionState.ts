import type { KnownDatabasePersistence } from "./knownDatabasePersistence";

/** Pages the user deleted, persisted with the snapshot. Hydration and the
 *  server union must never resurrect them (a lone snapshot cannot tell a
 *  deletion from a fresh browser's not-yet-filled placeholder). */
let deletedPageIds = new Set<string>();
/** The durable copy's side of the store; null without a window (tests, prerender). */
let persistence: KnownDatabasePersistence | null = null;

/** Tombstones to honour in the server sync (hydration union / replacement). */
export function getDeletedPageIds(): ReadonlySet<string> {
  return deletedPageIds;
}

export function markPageDeleted(pageId: string): void {
  deletedPageIds.add(pageId);
}

export function replaceDeletedPageIds(ids: Set<string>): void {
  deletedPageIds = ids;
}

export function getKnownDatabasePersistence(): KnownDatabasePersistence | null {
  return persistence;
}

export function setKnownDatabasePersistence(next: KnownDatabasePersistence): void {
  persistence = next;
}

/** I9, I7: a write before the stored copy is read, or in a pull-only tab, does nothing. */
export const isKnownDatabaseWritable = (): boolean => persistence?.canWrite() ?? true;

/** Resolves once the store holds this browser's stored copy instead of the seed. */
export function whenKnownDatabaseReady(): Promise<void> {
  return persistence?.ready ?? Promise.resolve();
}

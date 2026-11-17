/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   objectDatabaseBridgeSync.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/08 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Object databases (the inline `/database` blocks) used to live ONLY in browser
// localStorage — lost on a cache clear, invisible on any other machine. This
// module gives them a durable owner-isolated home in Postgres via the bridge
// (`/api/object-databases`, one row per database), while keeping localStorage as
// a write-through offline cache. It is intentionally offline-first: a missing
// session or an unreachable bridge degrades to local-only and retries on the
// next flush — it never throws into the persist path and never loses data.

import type { NotionState } from "@notion-db/object-database";
import { getActivePageJwt, API_BASE } from "@/shared/api/client";
import { isObjectDatabaseServerSyncEnabled } from "@/shared/config/featureFlags";
import { emptySlice, hashSlice, sliceAllDatabases, userDatabaseIds } from "./objectDatabaseSlice";
import { reconcileServerDatabases } from "./objectDatabaseReconcile";
import { withoutDeletedPages, tombstonesStillNeeded } from "./knownDatabasePersistedState";
import { startObjectDatabaseRealtime, stopObjectDatabaseRealtime } from "./objectDatabaseRealtime";
import { resetObjectDatabaseWorkspaces } from "./objectDatabaseWorkspaces";
import { databaseTitle, fetchServerDatabases, pushDatabaseSlice, serverStateOf } from "./objectDatabaseBridgeRequests";
import { createPushBaseline } from "./objectDatabasePushBaseline";
import { createPushRecord, type PushRecord, type PushRecordMap, type PushRecordSink } from "./objectDatabasePushRecord";
import { createSessionWait, type SessionWait } from "./sessionWait";
import { clearRefusedDatabaseSave, noticeRefusedDatabaseSave } from "./refusedDatabaseSave";

const HYDRATION_JWT_RETRY_MS = 1500;
const HYDRATION_JWT_MAX_ATTEMPTS = 12;

export type ObjectDatabaseSyncHooks = {
  /** Resolves once the store holds its stored copy; hydrate reconciles nothing before. */
  whenReady?: () => Promise<void>;
  getSeedIds: () => ReadonlySet<string>;
  getLiveState: () => NotionState;
  /** Pages the user deleted. Never pulled back from the server (the push that
   *  removes them may have been aborted by a reload). Optional: tests/no-store. */
  getDeletedPageIds?: () => ReadonlySet<string>;
  /** The server no longer holds a deleted row → its tombstone is dead weight.
   *  Called with the tombstones that are STILL needed; the store drops the
   *  others and re-persists so the stored snapshot shrinks.
   *  Optional: tests/no-store. */
  pruneDeletedPageIds?: (stillNeeded: ReadonlySet<string>) => void;
  applyMerged: (state: NotionState) => void;
  notifyReloaded?: () => void;
  reconcileRegistry?: (userDbKeys: string[]) => void;
};

let pushInFlight = false;
let hydrationDone = false; // hydrate() has been launched with a session this account
let hydrationWait: SessionWait | null = null; // the wait for the session token, one per account
let hydrationCompleted = false; // hydrate() finished — gates every push

/** Sync is possible only client-side, with the flag on and a bridge URL set
 *  (the offline/Playwright build blanks `VITE_API_URL`, so it no-ops there). */
export function objectDatabaseServerSyncReady(): boolean {
  return globalThis.window !== undefined && Boolean(API_BASE) && isObjectDatabaseServerSyncEnabled();
}

// The legacy home of the record (localStorage), read once at tab load. A store with a durable
// copy replaces both the record and its sink when its copy is read (devil I5).
const pushBaseline = createPushBaseline(() => globalThis.localStorage);
const legacySink: PushRecordSink = {
  isPullOnly: false,
  recordChanged: (map) => pushBaseline.save({ ...map }),
  reset: () => pushBaseline.reset(),
};
let record: PushRecord = createPushRecord(pushBaseline.load());
let sink: PushRecordSink = legacySink;

/** Seeds the record from the copy the store read, and names where it goes from now on. */
export function seedObjectDatabasePushRecord(initial: Readonly<PushRecordMap>, next: PushRecordSink = legacySink): void {
  record = createPushRecord(initial);
  sink = next;
}

export function objectDatabasePushRecord(): PushRecord {
  return record;
}

export { objectDatabasePushBody, objectDatabasePushBodyFor } from "./objectDatabaseBridgeRequests";

/** The starter a page invents for a database this tab has not seen. It says nothing the server
 *  needs: pushed, it blanks a real database or resurrects a deleted one (scripts/bridge-object-db-guard.mjs).
 *  Caveat: a database created here reaches the server at its first edit, not at its creation. */
export function isPristinePlaceholder(dbKey: string, slice: NotionState): boolean {
  const pages = Object.entries(slice.pages ?? {});
  if (pages.length > 1 || Object.keys(slice.databases?.[dbKey]?.properties ?? {}).length > 1) return false;
  const [entry] = pages;
  if (!entry) return true;
  const [id, page] = entry;
  return id === `${dbKey}-row-1` && !page.content?.length && Object.values(page.properties ?? {}).every((value) => value === "" || value == null);
}

let refreshAfterRefusal: (() => void) | null = null;

type DirtyItem = { dbKey: string; title: string; slice: NotionState; hash: string };

function dirtyItems(state: NotionState, seedIds: ReadonlySet<string>): DirtyItem[] {
  const pushed = record.snapshot();
  const slices = sliceAllDatabases(state);
  return userDatabaseIds(state, seedIds)
    .map((dbKey) => ({ dbKey, title: databaseTitle(state, dbKey), slice: slices.get(dbKey) ?? emptySlice() }))
    .map((item) => ({ ...item, hash: hashSlice(item.slice) }))
    .filter((item) => pushed[item.dbKey] !== item.hash && !isPristinePlaceholder(item.dbKey, item.slice));
}

async function pushItem(jwt: string, item: DirtyItem): Promise<void> {
  try {
    await pushDatabaseSlice(jwt, item.dbKey, item.title, item.slice);
    record.set(item.dbKey, item.hash);
    clearRefusedDatabaseSave(item.dbKey);
  } catch (error) {
    // The server holds this database and this tab has a blank: stop pushing and load it.
    if ((error as { status?: number }).status === 409) {
      record.set(item.dbKey, item.hash);
      refreshAfterRefusal?.();
    } else {
      record.delete(item.dbKey); // keep dirty → retried next flush
      noticeRefusedDatabaseSave(item.dbKey, item.title, item.hash, (error as { status?: number }).status);
    }
  }
}

/** Flush hook: upload every user database whose slice changed since its last
 *  successful push. Gated on `hydrationCompleted`
 *  — a browser MUST pull the server's copy before it may push, otherwise a fresh
 *  session (whose store is briefly empty, or holds an auto-created placeholder)
 *  could overwrite real server data before it ever saw it. Once hydration has run
 *  the store is reconciled, so pushing is safe.
 *  Fire-and-forget — a failed item simply stays dirty and retries next flush.
 *  A pull-only session (a fallback in a browser whose copy moved to IndexedDB) never pushes. */
export function pushDirtyObjectDatabases(
  state: NotionState,
  seedIds: ReadonlySet<string>,
  deletedPageIds?: ReadonlySet<string>,
): void {
  if (sink.isPullOnly || !objectDatabaseServerSyncReady() || pushInFlight || !hydrationCompleted) return;
  const jwt = getActivePageJwt();
  if (!jwt) return;
  // A tombstoned page must not be written back to the server (that would undo
  // the delete for every other client).
  const dirty = dirtyItems(deletedPageIds?.size ? withoutDeletedPages(state, deletedPageIds) : state, seedIds);
  // A database missing from `state` is never deleted remotely. Absence is not intent: a
  // state that did not persist (storage full), an empty or partial server list, or a flush
  // captured before hydrate all look like "every database was deleted". No delete action
  // exists in the UI ("Delete database" only closes the menu), so a remote delete needs an
  // explicit intent once one ships (groot ADR 0051).
  if (dirty.length === 0) return;
  pushInFlight = true;
  void (async () => {
    try {
      for (const item of dirty) await pushItem(jwt, item);
    } finally {
      pushInFlight = false;
      sink.recordChanged(record.snapshot());
    }
  })();
}

/** Pull the account's server databases and reconcile with local, biased against
 *  data loss: the server copy overwrites local ONLY when local is *provably* our
 *  last push (a clean, fully-synced database). Any local database that is dirty
 *  OR untracked (no known baseline — e.g. the first run after this shipped, or a
 *  direct-to-localStorage seed) KEEPS its local data and is pushed up instead —
 *  local pages are never dropped. A database only on the server is pulled in; a
 *  local user database only in the browser is auto-repaired (pushed up). Server
 *  truth is applied via `applyMerged` (write-through), then a push drains dirty. */
async function hydrate(hooks: ObjectDatabaseSyncHooks): Promise<void> {
  await hooks.whenReady?.(); // reconciling the seed would read every stored database as new
  const jwt = getActivePageJwt();
  if (!jwt) throw new Error("object-db hydrate: no session");
  const serverMap = await fetchServerDatabases(jwt);
  const seedIds = hooks.getSeedIds();
  const deletedPageIds = hooks.getDeletedPageIds?.() ?? new Set<string>();
  const { merged, changed } = reconcileWithServer(hooks, serverMap, seedIds, deletedPageIds);
  hydrationCompleted = true;
  if (changed) {
    hooks.applyMerged(merged);
    hooks.notifyReloaded?.(); // mounted views reload from the merged store immediately
  }
  // Never before applyMerged (devil R3, B1a): the record stays in memory and is stored with
  // the merged state's commit, or next to the copy already committed when nothing changed.
  sink.recordChanged(record.snapshot());
  hooks.reconcileRegistry?.(userDatabaseIds(merged, seedIds)); // list every synced db in the sidebar
  // Upload dirty + repaired now, not only on next edit. The live state, as every push (devil I3).
  pushDirtyObjectDatabases(hooks.getLiveState(), seedIds, deletedPageIds);
}

/** Reconciles the live state with the server's databases and sets the in-memory record. */
function reconcileWithServer(
  hooks: ObjectDatabaseSyncHooks,
  serverMap: Awaited<ReturnType<typeof fetchServerDatabases>>,
  seedIds: ReadonlySet<string>,
  deletedPageIds: ReadonlySet<string>,
): { merged: NotionState; changed: boolean } {
  const liveState = hooks.getLiveState();
  const live = withoutDeletedPages(liveState, deletedPageIds);
  const server = new Map([...serverMap].map(([dbKey, row]) => [dbKey, serverStateOf(row)] as const));
  const { merged, changed, nextPushed } = reconcileServerDatabases({ live, server, pushed: record.snapshot(), deletedPageIds });
  for (const dbKey of userDatabaseIds(merged, seedIds)) {
    if (!serverMap.has(dbKey)) delete nextPushed[dbKey]; // never on server → auto-repair on push
  }
  // A tombstone is only needed until the server agrees the row is gone: the
  // merge above already ran with the full set, so from here on a tombstone no
  // server slice holds is dead weight. An empty server map keeps them all (an
  // empty list can mean "not loaded" — never prune blind).
  hooks.pruneDeletedPageIds?.(tombstonesStillNeeded(deletedPageIds, [...server.values()]));
  record.replace(nextPushed);
  return { merged, changed: changed || live !== liveState };
}

/** Kick hydration once the session token exists. Waits briefly for it, then
 *  reconciles. If no token appears in time (e.g. the user logs in later) it
 *  stops WITHOUT latching, so a subsequent call retries with the fresh session;
 *  a call that finds the token while the wait sleeps starts it now (App calls
 *  this when a sign-in lands). Any failure degrades to local-only (edits still
 *  push once the bridge is up). */
export function ensureObjectDatabaseHydration(hooks: ObjectDatabaseSyncHooks): void {
  if (hydrationDone) return;
  if (!objectDatabaseServerSyncReady()) return;
  hydrationWait ??= createSessionWait({
    hasSession: () => Boolean(getActivePageJwt()),
    start: () => {
      hydrationDone = true;
      void hydrate(hooks).catch(() => undefined);
      // Live cross-client refresh: re-run the same data-loss-safe hydration whenever
      // another browser/tab of this account writes (idempotent + coalesced).
      refreshAfterRefusal = () => { void hydrate(hooks).catch(() => undefined); };
      startObjectDatabaseRealtime(refreshAfterRefusal);
    },
    retryMs: HYDRATION_JWT_RETRY_MS,
    maxAttempts: HYDRATION_JWT_MAX_ATTEMPTS,
  });
  hydrationWait.poke();
}

/** Start clean for a different account (call on account switch): the next
 *  hydration re-runs for the new session and no old push baseline lingers. */
export function resetObjectDatabaseSync(): void {
  stopObjectDatabaseRealtime();
  refreshAfterRefusal = null;
  hydrationWait?.cancel();
  hydrationWait = null;
  hydrationDone = false;
  hydrationCompleted = false;
  resetObjectDatabaseWorkspaces();
  record.replace({}); // in memory; only the legacy sink also clears its stored copy (devil I4)
  sink.reset();
}

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
import { api, getActivePageJwt, API_BASE } from "@/shared/api/client";
import { isObjectDatabaseServerSyncEnabled } from "@/shared/config/featureFlags";
import { hashSlice, sliceDatabase, userDatabaseIds, withMergedSlice, withServerSlice } from "./objectDatabaseSlice";
import { startObjectDatabaseRealtime, stopObjectDatabaseRealtime } from "./objectDatabaseRealtime";

const PUSHED_HASHES_KEY = "osionos.objectDb.pushed.v1";
const HYDRATION_JWT_RETRY_MS = 1500;
const HYDRATION_JWT_MAX_ATTEMPTS = 12;

type ServerObjectDatabase = { dbKey: string; title?: string; state?: NotionState };
type ServerListResponse = { databases?: ServerObjectDatabase[] };

export type ObjectDatabaseSyncHooks = {
  getSeedIds: () => ReadonlySet<string>;
  getLiveState: () => NotionState;
  applyMerged: (state: NotionState) => void;
  notifyReloaded?: () => void;
  reconcileRegistry?: (userDbKeys: string[]) => void;
};

let pushInFlight = false;
let hydrationDone = false; // hydrate() has been launched with a session this account
let hydrationPolling = false; // a jwt-wait loop is currently running (no concurrent polls)
let hydrationCompleted = false; // hydrate() finished — gates delete propagation

/** Sync is possible only client-side, with the flag on and a bridge URL set
 *  (the offline/Playwright build blanks `VITE_API_URL`, so it no-ops there). */
export function objectDatabaseServerSyncReady(): boolean {
  return globalThis.window !== undefined && Boolean(API_BASE) && isObjectDatabaseServerSyncEnabled();
}

function loadPushedHashes(): Record<string, string> {
  try {
    const parsed = JSON.parse(globalThis.localStorage.getItem(PUSHED_HASHES_KEY) ?? "null");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function savePushedHashes(map: Record<string, string>): void {
  try {
    globalThis.localStorage.setItem(PUSHED_HASHES_KEY, JSON.stringify(map));
  } catch {
    // localStorage can be unavailable or quota-limited — dirtiness just recomputes.
  }
}

function databaseTitle(state: NotionState, dbKey: string): string {
  const database = state.databases[dbKey] as { name?: string; title?: string } | undefined;
  return String(database?.name ?? database?.title ?? "Untitled").slice(0, 200) || "Untitled";
}

// ── bridge I/O (owner scoping is enforced server-side from the session token) ─
async function fetchServerDatabases(jwt: string): Promise<Map<string, ServerObjectDatabase>> {
  const response = await api.get<ServerListResponse>("/api/object-databases", jwt);
  const map = new Map<string, ServerObjectDatabase>();
  for (const row of response.databases ?? []) if (row?.dbKey) map.set(row.dbKey, row);
  return map;
}

async function pushDatabaseSlice(jwt: string, dbKey: string, title: string, slice: NotionState): Promise<void> {
  await api.post("/api/object-databases", { dbKey, title, state: slice }, jwt);
}

async function deleteDatabaseRemote(jwt: string, dbKey: string): Promise<void> {
  await api.delete(`/api/object-databases/${encodeURIComponent(dbKey)}`, jwt);
}

/** Flush hook: upload every user database whose slice changed since its last
 *  successful push, and propagate local deletions. Gated on `hydrationCompleted`
 *  — a browser MUST pull the server's copy before it may push, otherwise a fresh
 *  session (whose store is briefly empty, or holds an auto-created placeholder)
 *  could overwrite real server data before it ever saw it. Once hydration has run
 *  the store is reconciled, so pushing is safe.
 *  Fire-and-forget — a failed item simply stays dirty and retries next flush. */
export function pushDirtyObjectDatabases(state: NotionState, seedIds: ReadonlySet<string>): void {
  if (!objectDatabaseServerSyncReady() || pushInFlight || !hydrationCompleted) return;
  const jwt = getActivePageJwt();
  if (!jwt) return;

  const pushed = loadPushedHashes();
  const userIds = new Set(userDatabaseIds(state, seedIds));
  const dirty = [...userIds]
    .map((dbKey) => ({ dbKey, title: databaseTitle(state, dbKey), slice: sliceDatabase(state, dbKey) }))
    .map((item) => ({ ...item, hash: hashSlice(item.slice) }))
    .filter((item) => pushed[item.dbKey] !== item.hash);
  const removed = Object.keys(pushed).filter((dbKey) => !userIds.has(dbKey));
  if (dirty.length === 0 && removed.length === 0) return;

  pushInFlight = true;
  void (async () => {
    const next = loadPushedHashes();
    try {
      for (const item of dirty) {
        try {
          await pushDatabaseSlice(jwt, item.dbKey, item.title, item.slice);
          next[item.dbKey] = item.hash;
        } catch {
          delete next[item.dbKey]; // keep dirty → retried next flush
        }
      }
      for (const dbKey of removed) {
        try {
          await deleteDatabaseRemote(jwt, dbKey);
          delete next[dbKey];
        } catch {
          // leave the hash so the delete retries next flush
        }
      }
      savePushedHashes(next);
    } finally {
      pushInFlight = false;
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
  const jwt = getActivePageJwt();
  if (!jwt) throw new Error("object-db hydrate: no session");
  const serverMap = await fetchServerDatabases(jwt);

  const seedIds = hooks.getSeedIds();
  const pushed = loadPushedHashes();
  const nextPushed: Record<string, string> = { ...pushed };
  let merged = hooks.getLiveState();
  let changed = false;

  for (const [dbKey, row] of serverMap) {
    const serverState = row.state ?? ({ databases: {}, pages: {}, views: {} } as NotionState);
    const localHash = hashSlice(sliceDatabase(merged, dbKey));
    if (merged.databases[dbKey] && pushed[dbKey] !== localHash) {
      // Local is dirty/untracked — genuine offline edits OR a fresh placeholder
      // auto-created before this pull landed. Union with the server so neither
      // side loses a record (a placeholder can no longer erase real data), then
      // re-push the union (drop the baseline so it counts as dirty next flush).
      const unionCandidate = withMergedSlice(merged, dbKey, serverState);
      delete nextPushed[dbKey];
      if (hashSlice(sliceDatabase(unionCandidate, dbKey)) !== localHash) {
        merged = unionCandidate;
        changed = true;
      }
      continue;
    }
    const candidate = withServerSlice(merged, dbKey, serverState);
    const serverHash = hashSlice(sliceDatabase(candidate, dbKey));
    nextPushed[dbKey] = serverHash; // baseline: local now equals server
    if (serverHash !== localHash) {
      merged = candidate;
      changed = true;
    }
  }

  for (const dbKey of userDatabaseIds(merged, seedIds)) {
    if (!serverMap.has(dbKey)) delete nextPushed[dbKey]; // never on server → auto-repair on push
  }

  savePushedHashes(nextPushed);
  hydrationCompleted = true;
  if (changed) {
    hooks.applyMerged(merged);
    hooks.notifyReloaded?.(); // mounted views reload from the merged store immediately
  }
  hooks.reconcileRegistry?.(userDatabaseIds(merged, seedIds)); // list every synced db in the sidebar
  pushDirtyObjectDatabases(merged, seedIds); // upload dirty + repaired now, not only on next edit
}

/** Kick hydration once the session token exists. Waits briefly for it, then
 *  reconciles. If no token appears in time (e.g. the user logs in later) it
 *  stops WITHOUT latching, so a subsequent call retries with the fresh session.
 *  Any failure degrades to local-only (edits still push once the bridge is up). */
export function ensureObjectDatabaseHydration(hooks: ObjectDatabaseSyncHooks): void {
  if (hydrationDone || hydrationPolling) return;
  if (!objectDatabaseServerSyncReady()) return;
  hydrationPolling = true;

  let attempts = 0;
  const attempt = (): void => {
    if (getActivePageJwt()) {
      hydrationPolling = false;
      hydrationDone = true;
      void hydrate(hooks).catch(() => undefined);
      // Live cross-client refresh: re-run the same data-loss-safe hydration whenever
      // another browser/tab of this account writes (idempotent + coalesced).
      startObjectDatabaseRealtime(() => { void hydrate(hooks).catch(() => undefined); });
      return;
    }
    attempts += 1;
    if (attempts < HYDRATION_JWT_MAX_ATTEMPTS) {
      globalThis.setTimeout(attempt, HYDRATION_JWT_RETRY_MS);
    } else {
      hydrationPolling = false; // gave up; a later call (post-login) retries cleanly
    }
  };
  attempt();
}

/** Start clean for a different account (call on account switch): the next
 *  hydration re-runs for the new session and no old push baseline lingers. */
export function resetObjectDatabaseSync(): void {
  stopObjectDatabaseRealtime();
  hydrationDone = false;
  hydrationPolling = false;
  hydrationCompleted = false;
  try {
    globalThis.localStorage?.removeItem(PUSHED_HASHES_KEY);
  } catch {
    // localStorage may be unavailable — the baseline just recomputes.
  }
}

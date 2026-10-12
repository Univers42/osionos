/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   syncLedgerPersist.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The sync ledger (ideSyncEngine: path → hash both sides last agreed on) must
// outlive a reload: without it, every file that differs after a reload has no
// merge base, so attach could only clobber it or call it a conflict. Stored as
// {[workspaceId]: {[path]: hash}} under one localStorage key.
//
// Ponytail: eviction is least-recently-WRITTEN by Map/JSON key order, and JS
// enumerates integer-like keys ("42") first, so after a reload such a workspace
// id or path is evicted out of turn. An evicted entry (bounds, quota) reads as
// "never synced", which sends the attach reconcile to its tiebreak/conflict
// path, never to a silent overwrite. Two tabs on one workspace: the last flush
// wins that workspace, leaving the other tab's older (still real) agreements —
// DEBOUNCE_MS below says what an older agreement gets wrong.

export type LedgerStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type SyncLedgerStore = {
  get(workspaceId: string, relPath: string): string | undefined;
  set(workspaceId: string, relPath: string, hash: string): void;
  delete(workspaceId: string, relPath: string): void;
  /** Write pending changes synchronously (pagehide, tests). */
  flush(): void;
};

export const SYNC_LEDGER_KEY = "osio.ide.synced.v1";
export const MAX_LEDGER_PATHS = 5000;
export const MAX_LEDGER_WORKSPACES = 20;
// Ponytail: a tab killed inside this window without a pagehide (crash, OOM)
// loses the window's writes. The older hashes left behind are real past
// agreements: mostly they just turn a one-sided change into a conflict, but an
// ABA edit (a side changed, then changed back) resolves to the other side.
const DEBOUNCE_MS = 300;

type Ledger = Map<string, Map<string, string>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Drop the oldest-inserted keys until `map` holds at most `max`. */
function trimOldest<V>(map: Map<string, V>, max: number): Map<string, V> {
  for (const key of map.keys()) {
    if (map.size <= max) break;
    map.delete(key);
  }
  return map;
}

/** The stored document. Unreadable or corrupted → empty; the next write overwrites it. */
function readLedger(storage: LedgerStorage): Ledger {
  const ledger: Ledger = new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(storage.getItem(SYNC_LEDGER_KEY) ?? "{}");
  } catch {
    return ledger;
  }
  if (!isRecord(parsed)) return ledger;
  for (const [workspaceId, paths] of Object.entries(parsed)) {
    if (!isRecord(paths)) continue;
    const hashes = new Map<string, string>();
    for (const [relPath, hash] of Object.entries(paths)) if (typeof hash === "string") hashes.set(relPath, hash);
    ledger.set(workspaceId, trimOldest(hashes, MAX_LEDGER_PATHS));
  }
  return ledger;
}

const serialize = (ledger: Ledger): string =>
  JSON.stringify(Object.fromEntries([...ledger].map(([workspaceId, paths]) => [workspaceId, Object.fromEntries(paths)])));

/** Write, dropping least-recently-written workspaces while storage refuses (quota). */
function writeLedger(storage: LedgerStorage, ledger: Ledger): void {
  trimOldest(ledger, MAX_LEDGER_WORKSPACES);
  for (;;) {
    try {
      storage.setItem(SYNC_LEDGER_KEY, serialize(ledger));
      return;
    } catch (error) {
      if (ledger.size <= 1) {
        console.warn("[ide] sync ledger not persisted; after a reload these files reconcile as never synced", error);
        return;
      }
      trimOldest(ledger, ledger.size - 1);
    }
  }
}

/** Insert as the most recently written key, evicting the oldest past `max`. */
function setNewest<V>(map: Map<string, V>, key: string, value: V, max: number): void {
  map.delete(key);
  map.set(key, value);
  trimOldest(map, max);
}

/** Merge this tab's changed workspaces into the stored document (as the most
 *  recently written) and write it. */
function persistWorkspaces(storage: LedgerStorage, changed: [string, Map<string, string>][]): void {
  const ledger = readLedger(storage);
  for (const [workspaceId, paths] of changed) {
    ledger.delete(workspaceId);
    if (paths.size > 0) ledger.set(workspaceId, paths);
  }
  writeLedger(storage, ledger);
}

/** A ledger store over `storage` (null = memory-only). Each workspace hydrates
 *  on first access; changes persist debounced, merged into the stored document
 *  so workspaces this tab never touched keep what another tab wrote. */
export function createSyncLedgerStore(opts: { storage: LedgerStorage | null; debounceMs?: number }): SyncLedgerStore {
  const { storage } = opts;
  const hydrated: Ledger = new Map();
  const dirty = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const pathsOf = (workspaceId: string): Map<string, string> => {
    let paths = hydrated.get(workspaceId);
    if (!paths) {
      paths = (storage && readLedger(storage).get(workspaceId)) || new Map<string, string>();
      hydrated.set(workspaceId, paths);
    }
    return paths;
  };
  const flush = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (storage && dirty.size > 0) persistWorkspaces(storage, [...dirty].map((id) => [id, pathsOf(id)]));
    dirty.clear();
  };
  const touched = (workspaceId: string): void => {
    if (!storage) return;
    dirty.delete(workspaceId);
    dirty.add(workspaceId);
    timer ??= setTimeout(flush, opts.debounceMs ?? DEBOUNCE_MS);
  };

  return {
    get: (workspaceId, relPath) => pathsOf(workspaceId).get(relPath),
    set(workspaceId, relPath, hash) {
      setNewest(pathsOf(workspaceId), relPath, hash, MAX_LEDGER_PATHS);
      touched(workspaceId);
    },
    delete(workspaceId, relPath) {
      if (pathsOf(workspaceId).delete(relPath)) touched(workspaceId);
    },
    flush,
  };
}

function browserStorage(): LedgerStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // storage blocked (privacy mode, sandboxed frame): memory-only ledger
  }
}

let defaultStore: SyncLedgerStore | null = null;

/** The app-wide store, created on first use over localStorage. */
export function syncLedgerStore(): SyncLedgerStore {
  if (!defaultStore) {
    defaultStore = createSyncLedgerStore({ storage: browserStorage() });
    if (typeof window !== "undefined") window.addEventListener("pagehide", flushSyncLedger);
  }
  return defaultStore;
}

/** Swap the backing storage and drop all in-memory state (a reload, for tests). */
export function configureSyncLedgerStorage(storage: LedgerStorage | null): void {
  defaultStore?.flush();
  defaultStore = createSyncLedgerStore({ storage });
}

export function flushSyncLedger(): void {
  defaultStore?.flush();
}

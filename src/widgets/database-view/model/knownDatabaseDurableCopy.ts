/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   knownDatabaseDurableCopy.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The durable copy of the known-database state, kept in IndexedDB because the localStorage key
// (3.4-4.6M characters) fills the origin's ~5 MiB quota. The state and the push record are stored
// with a shared id: a push record that runs ahead of its state would make the next load treat a
// stale database as clean, or push a stale dirty copy over newer server data. Every write is one
// transaction, and the record alone is written only while the stored state is still ours.
// A session that fell back (no IndexedDB in time) never writes the store (I7).

import type { KeyValueStore } from "@/shared/lib/key-value-store/indexedKeyValueStore";
import { setItemEvictingPageCaches, type PageCacheStorage } from "@/store/pageStore.helpers";

// Same literals as knownDatabaseStorage.ts and objectDatabasePushBaseline.ts, which import the
// toast layer; this module stays free of it so it loads in the canvas tests.
const LEGACY_STATE_KEY = "osionos.knownDatabaseState.v1";
const LEGACY_PUSHED_KEY = "osionos.objectDb.pushed.v1";
// ADR 0055 J-C1: a migrated copy's id names the tab that migrated it, so the redo rule never
// writes an id an unload journal of an earlier session names. "migrated" is an older build's id.
const MIGRATED_PREFIX = "migrated";
const migratedId = (tabId: string): string => `${MIGRATED_PREFIX}:${tabId}`;
const isMigratedId = (id: string): boolean => id === MIGRATED_PREFIX || id.startsWith(`${MIGRATED_PREFIX}:`);
const DEFAULT_BUDGET_MS = 3000;

export const KDS_IDB_FLAG_KEY = "osionos.kds.idb";

export type DurableCopyMode = "idb" | "fallback-flagged" | "fallback-legacy";
export interface LoadedCopy {
  mode: DurableCopyMode;
  text: string | null;
  record: Record<string, string>;
}
export interface DurableCopyOptions {
  openStore: () => Promise<KeyValueStore>;
  /** Enumerable, so that a full origin can evict its page caches to store the flag. */
  legacy: PageCacheStorage | undefined;
  tabId: string;
  budgetMs?: number;
}
export interface DurableCopy {
  readonly ready: Promise<LoadedCopy>;
  /** R1. Captures synchronously; resolves true only after the transaction completed. */
  commit(stateRef: object, text: string, record: Readonly<Record<string, string>>): Promise<boolean>;
  /** I1 strict gate. Writes the record alone, or nothing. Resolves whether it wrote. */
  commitRecord(liveRef: object, record: Readonly<Record<string, string>>): Promise<boolean>;
  close(): void;
}

type LegacyStorage = DurableCopyOptions["legacy"];
interface StoredState { text: string; id: string }
interface StoredPushed { map: Record<string, string>; stateId: string }

function readLegacyItem(legacy: LegacyStorage, key: string): string | null {
  try { return legacy?.getItem(key) ?? null; } catch { return null; }
}

function readLegacyRecord(legacy: LegacyStorage): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(readLegacyItem(legacy, LEGACY_PUSHED_KEY) ?? "null");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

// Flag first, read back: a crash between the two steps must leave a flagged origin, never an
// unflagged one whose legacy keys are gone. The origin is full by the premise of this copy, so the
// flag makes room in the page caches (the server rebuilds them); unflagged legacy keys are a pair
// that a later load without IndexedDB pushes over newer server data (devil N1). A flag that still
// does not fit keeps the legacy keys, and the next load retries.
function retireLegacy(legacy: LegacyStorage): void {
  if (!legacy || !setItemEvictingPageCaches(KDS_IDB_FLAG_KEY, "1", legacy)) return;
  if (readLegacyItem(legacy, KDS_IDB_FLAG_KEY) !== "1") return;
  try {
    legacy.removeItem(LEGACY_STATE_KEY);
    legacy.removeItem(LEGACY_PUSHED_KEY);
  } catch {
    // Keys left behind a stored flag are never read: a flagged origin falls back pull-only.
  }
}

function fallbackCopy(legacy: LegacyStorage): LoadedCopy {
  if (readLegacyItem(legacy, KDS_IDB_FLAG_KEY) === "1") {
    return { mode: "fallback-flagged", text: null, record: {} };
  }
  return { mode: "fallback-legacy", text: readLegacyItem(legacy, LEGACY_STATE_KEY), record: readLegacyRecord(legacy) };
}

function isState(value: unknown): value is StoredState {
  return typeof value === "object" && value !== null && typeof (value as StoredState).text === "string";
}

function loadedFrom(state: StoredState | null, pushed: unknown): LoadedCopy {
  const map = (pushed as StoredPushed | undefined)?.map;
  return { mode: "idb", text: state?.text ?? null, record: state ? { ...map } : {} };
}

interface LegacySnapshot { text: string | null; map: Record<string, string>; isRetired: boolean }

function snapshotLegacy(legacy: LegacyStorage): LegacySnapshot {
  return {
    text: readLegacyItem(legacy, LEGACY_STATE_KEY),
    map: readLegacyRecord(legacy),
    isRetired: readLegacyItem(legacy, KDS_IDB_FLAG_KEY) === "1",
  };
}

function migratedEntries(text: string, map: Record<string, string>, id: string): Record<string, unknown> {
  return {
    state: { text, id } satisfies StoredState,
    pushed: { map, stateId: id } satisfies StoredPushed,
  };
}

// A stored "migrated" copy next to a legacy key that was never retired means an earlier migration
// was abandoned by the budget before it could retire its source: the legacy copy kept receiving
// edits, so it is the newer one and is migrated again.
async function decideInitialCopy(store: KeyValueStore, options: DurableCopyOptions, isAbandoned: () => boolean): Promise<LoadedCopy> {
  const { legacy } = options;
  const source = snapshotLegacy(legacy);
  let loaded = loadedFrom(null, undefined);
  await store.update(["state", "pushed"], current => {
    const found = current.get("state");
    const redo = isState(found) && isMigratedId(found.id) && !source.isRetired && source.text !== null;
    if (isState(found) && !redo) { loaded = loadedFrom(found, current.get("pushed")); return null; }
    // An abandoned session is a fallback one and must not write (I7).
    if (source.text === null || isAbandoned()) return null;
    loaded = { mode: "idb", text: source.text, record: source.map };
    return migratedEntries(source.text, source.map, migratedId(options.tabId));
  }, { durability: "strict" });
  // An abandoned session keeps writing the legacy keys; retiring them would orphan its edits.
  if (loaded.text !== null && !isAbandoned()) retireLegacy(legacy);
  return loaded;
}

interface Session {
  store: KeyValueStore | null;
  mode: DurableCopyMode | "pending";
  abandoned: boolean;
  seq: number;
  pending: number;
  failed: boolean;
  committedRef: object | null;
  committedId: string | null;
  chain: Promise<unknown>;
}

function fallBack(session: Session, legacy: LegacyStorage): LoadedCopy {
  session.abandoned = true;
  session.store?.close();
  const loaded = fallbackCopy(legacy);
  session.mode = loaded.mode;
  return loaded;
}

// Caveat: the budget covers the open and the readiness transaction together, so a slow disk
// reads as "unavailable" and the session runs on the fallback; a store that opens later is
// closed, never used.
function startReady(session: Session, options: DurableCopyOptions): Promise<LoadedCopy> {
  return new Promise<LoadedCopy>(resolve => {
    const timer = setTimeout(() => resolve(fallBack(session, options.legacy)), options.budgetMs ?? DEFAULT_BUDGET_MS);
    const settle = (loaded: LoadedCopy | null) => {
      if (session.abandoned) return;
      clearTimeout(timer);
      if (loaded) session.mode = "idb";
      resolve(loaded ?? fallBack(session, options.legacy));
    };
    options.openStore()
      .then(opened => {
        if (session.abandoned) { opened.close(); return null; }
        session.store = opened;
        return decideInitialCopy(opened, options, () => session.abandoned);
      })
      .then(settle, () => settle(null));
  });
}

// Writes run one after another so a failed older commit cannot clear the flag of a newer one.
function enqueue<T>(session: Session, job: () => Promise<T>): Promise<T> {
  const run = session.chain.then(job);
  session.chain = run.catch(() => undefined);
  return run;
}

function commitState(session: Session, tabId: string, stateRef: object, text: string, record: Readonly<Record<string, string>>): Promise<boolean> {
  const target = session.store;
  if (session.mode !== "idb" || !target) return Promise.resolve(false);
  const id = `${tabId}:${++session.seq}`;
  const map = { ...record };
  session.pending += 1;
  return enqueue(session, () => target.update([], () => ({
    state: { text, id } satisfies StoredState,
    pushed: { map, stateId: id } satisfies StoredPushed,
  }), { durability: "strict" })).then(
    () => { session.committedRef = stateRef; session.committedId = id; session.failed = false; return true; },
    () => { session.failed = true; return false; },
  ).finally(() => { session.pending -= 1; });
}

function canCommitRecord(session: Session, liveRef: object): boolean {
  return session.mode === "idb" && session.store !== null && session.committedId !== null
    && liveRef === session.committedRef && session.pending === 0 && !session.failed;
}

function commitPushRecord(session: Session, liveRef: object, record: Readonly<Record<string, string>>): Promise<boolean> {
  const target = session.store;
  const id = session.committedId;
  if (!target || id === null || !canCommitRecord(session, liveRef)) return Promise.resolve(false);
  const map = { ...record };
  let wrote = false;
  return enqueue(session, () => target.update(["state"], current => {
    if ((current.get("state") as StoredState | undefined)?.id !== id) return null;
    wrote = true;
    return { pushed: { map, stateId: id } satisfies StoredPushed };
  }, { durability: "strict" })).then(() => wrote, () => false);
}

export function openDurableCopy(options: DurableCopyOptions): DurableCopy {
  const session: Session = {
    store: null, mode: "pending", abandoned: false, seq: 0, pending: 0, failed: false,
    committedRef: null, committedId: null, chain: Promise.resolve(),
  };
  return {
    ready: startReady(session, options),
    commit: (stateRef, text, record) => commitState(session, options.tabId, stateRef, text, record),
    commitRecord: (liveRef, record) => commitPushRecord(session, liveRef, record),
    close: () => session.store?.close(),
  };
}

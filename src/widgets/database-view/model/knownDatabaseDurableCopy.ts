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
import { createCommitLedger, type CommitLedger, type CommitLedgerTracker } from "./knownDatabaseCommitLedger";
import type { ReadinessJournals } from "./knownDatabaseJournalApply";

// Same literals as knownDatabaseStorage.ts and objectDatabasePushBaseline.ts, which import the
// toast layer; this module stays free of it so it loads in the canvas tests.
const LEGACY_STATE_KEY = "osionos.knownDatabaseState.v1";
const LEGACY_PUSHED_KEY = "osionos.objectDb.pushed.v1";
const LEGACY_RETIRED_TEXT = '{"kdsRetired":"idb"}';
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
  /** The unload journals of earlier documents, applied by the readiness transaction (ADR 0055). */
  journals?: ReadinessJournals;
  /** The seed as stored text; an empty store with no legacy copy stores it at readiness (A2). */
  seedText?: () => string;
}
export interface DurableCopy {
  readonly ready: Promise<LoadedCopy>;
  /** R1. Captures synchronously; resolves true only after the transaction completed. */
  commit(stateRef: object, text: string, record: Readonly<Record<string, string>>): Promise<boolean>;
  /** I1 strict gate. Writes the record alone, or nothing. Resolves whether it wrote. */
  commitRecord(liveRef: object, record: Readonly<Record<string, string>>): Promise<boolean>;
  /** The ids this copy may hold next, as far as this tab knows (ADR 0055 J-C1). */
  ledger(): CommitLedger;
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

// Caveat: a retired origin (flag stored, or state key tombstoned) is read pull-only. The tombstone
// works because a full origin refuses only growing writes and it shrinks the state key (measured on
// Chromium 147, Firefox 148 and WebKit 26.4; Mac Chrome inferred). An origin with no legacy text,
// or text under 20 characters, gets no marker (R-C7b) and falls back to its legacy pair.
function isLegacyRetired(legacy: LegacyStorage): boolean {
  return readLegacyItem(legacy, KDS_IDB_FLAG_KEY) === "1"
    || readLegacyItem(legacy, LEGACY_STATE_KEY) === LEGACY_RETIRED_TEXT;
}

// Tombstone, read back, then the push record: a crash between the steps leaves a marker or the
// intact pair (devil C7). A tombstone is never a state: the snapshot reads no text, no record.
function markStateRetired(legacy: NonNullable<LegacyStorage>): void {
  const stored = readLegacyItem(legacy, LEGACY_STATE_KEY);
  if (stored === null) return;
  if (stored !== LEGACY_RETIRED_TEXT) {
    if (!setItemEvictingPageCaches(LEGACY_STATE_KEY, LEGACY_RETIRED_TEXT, legacy)) return;
    if (readLegacyItem(legacy, LEGACY_STATE_KEY) !== LEGACY_RETIRED_TEXT) return;
  }
  try { legacy.removeItem(LEGACY_PUSHED_KEY); } catch { /* a tombstoned origin never reads it */ }
}

// Flag first, read back: a crash between the two steps must leave a flagged origin, never an
// unflagged one whose legacy keys are gone. The origin is full by the premise of this copy, so the
// flag makes room in the page caches (the server rebuilds them); unflagged legacy keys are a pair
// that a later load without IndexedDB pushes over newer server data (devil N1). A flag that still
// does not fit tombstones the state key instead, and the next load retries the flag.
function retireLegacy(legacy: LegacyStorage): void {
  if (!legacy) return;
  if (!setItemEvictingPageCaches(KDS_IDB_FLAG_KEY, "1", legacy) || readLegacyItem(legacy, KDS_IDB_FLAG_KEY) !== "1") {
    markStateRetired(legacy);
    return;
  }
  try {
    legacy.removeItem(LEGACY_STATE_KEY);
    legacy.removeItem(LEGACY_PUSHED_KEY);
  } catch {
    // Keys left behind a stored flag are never read: a flagged origin falls back pull-only.
  }
}

function fallbackCopy(legacy: LegacyStorage): LoadedCopy {
  if (isLegacyRetired(legacy)) {
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
  const text = readLegacyItem(legacy, LEGACY_STATE_KEY);
  const isTombstone = text === LEGACY_RETIRED_TEXT;
  return {
    text: isTombstone ? null : text,
    map: isTombstone ? {} : readLegacyRecord(legacy),
    isRetired: isLegacyRetired(legacy),
  };
}

function copyEntries(text: string, map: Record<string, string>, id: string): Record<string, unknown> {
  return {
    state: { text, id } satisfies StoredState,
    pushed: { map, stateId: id } satisfies StoredPushed,
  };
}

// ADR 0055 J-C3: earlier unloads' journals land in the transaction that reads the copy, before
// memory is replaced, under an ordinary id of this tab. An abandoned session must not write (I7).
function readFound(found: StoredState, pushed: unknown, options: DurableCopyOptions, session: Session): { loaded: LoadedCopy; entries: Record<string, unknown> | null } {
  const loaded = loadedFrom(found, pushed);
  const merged = session.abandoned ? null : options.journals?.merge({ id: found.id, text: found.text, record: loaded.record });
  if (!merged) {
    session.ledger.loaded(found.id);
    return { loaded, entries: null };
  }
  const id = `${options.tabId}:${++session.seq}`;
  session.ledger.loaded(id);
  return { loaded: { mode: "idb", text: merged.text, record: merged.record }, entries: copyEntries(merged.text, merged.record, id) };
}

// A stored "migrated" copy next to a legacy key that was never retired means an earlier migration
// was abandoned by the budget before it could retire its source: the legacy copy kept receiving
// edits, so it is the newer one and is migrated again.
async function decideInitialCopy(store: KeyValueStore, options: DurableCopyOptions, session: Session): Promise<LoadedCopy> {
  const { legacy } = options;
  const isAbandoned = () => session.abandoned;
  const source = snapshotLegacy(legacy);
  let loaded = loadedFrom(null, undefined);
  await store.update(["state", "pushed"], current => {
    const found = current.get("state");
    const redo = isState(found) && isMigratedId(found.id) && !source.isRetired && source.text !== null;
    if (isState(found) && !redo) {
      const read = readFound(found, current.get("pushed"), options, session);
      loaded = read.loaded;
      return read.entries;
    }
    // An abandoned session is a fallback one and must not write (I7). A first session stores the
    // seed as a migrated copy: its unload journal then has a base, and a seed put the budget
    // abandoned is redone from the legacy copy the fallback session wrote (devil R8, A2).
    const text = isAbandoned() ? null : source.text ?? options.seedText?.() ?? null;
    if (text === null) return null;
    loaded = { mode: "idb", text, record: source.map };
    session.ledger.loaded(migratedId(options.tabId));
    return copyEntries(text, source.map, migratedId(options.tabId));
  }, { durability: "strict" });
  if (!isAbandoned()) options.journals?.discard();
  // An abandoned session keeps writing the legacy keys; retiring them would orphan its edits.
  if (loaded.text !== null && !isAbandoned()) retireLegacy(legacy);
  return loaded;
}

interface Session {
  store: KeyValueStore | null;
  mode: DurableCopyMode | "pending";
  abandoned: boolean;
  seq: number;
  failed: boolean;
  ledger: CommitLedgerTracker;
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
        return decideInitialCopy(opened, options, session);
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
  session.ledger.started({ id, stateRef, record: map });
  return enqueue(session, () => target.update([], () => ({
    state: { text, id } satisfies StoredState,
    pushed: { map, stateId: id } satisfies StoredPushed,
  }), { durability: "strict" })).then(
    () => { session.ledger.settled(id, true); session.failed = false; return true; },
    () => { session.ledger.settled(id, false); session.failed = true; return false; },
  );
}

function canCommitRecord(session: Session, liveRef: object): boolean {
  return session.mode === "idb" && session.store !== null && liveRef === session.ledger.lastResolved?.stateRef
    && session.ledger.pendingCount === 0 && !session.failed;
}

function commitPushRecord(session: Session, liveRef: object, record: Readonly<Record<string, string>>): Promise<boolean> {
  const target = session.store;
  const id = session.ledger.lastResolved?.id;
  if (!target || id === undefined || !canCommitRecord(session, liveRef)) return Promise.resolve(false);
  const map = { ...record };
  let wrote = false;
  return enqueue(session, () => target.update(["state"], current => {
    if ((current.get("state") as StoredState | undefined)?.id !== id) return null;
    wrote = true;
    return { pushed: { map, stateId: id } satisfies StoredPushed };
  }, { durability: "strict" })).then(() => {
    if (wrote) session.ledger.recordStored(id, map);
    return wrote;
  }, () => false);
}

export function openDurableCopy(options: DurableCopyOptions): DurableCopy {
  const session: Session = {
    store: null, mode: "pending", abandoned: false, seq: 0, failed: false,
    ledger: createCommitLedger(), chain: Promise.resolve(),
  };
  return {
    ready: startReady(session, options),
    commit: (stateRef, text, record) => commitState(session, options.tabId, stateRef, text, record),
    commitRecord: (liveRef, record) => commitPushRecord(session, liveRef, record),
    ledger: () => session.ledger.view(),
    close: () => session.store?.close(),
  };
}

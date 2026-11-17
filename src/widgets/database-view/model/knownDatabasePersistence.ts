/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   knownDatabasePersistence.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The known-database store on its durable copy (groot ADR 0051, devil D1 conditions I1-I13).
// The stored state and the stored push record must describe the same moment: a record ahead of
// its state reads a stale database as clean, and the next pull or push reverts another device's
// edit on the server. So the record is stored only inside a commit of the state it was captured
// with, or by a catch-up the durable copy refuses unless the live state is the copy last
// committed by this tab. Every push sends the live state, never a copy captured before an await:
// the push lives here, so the tests that drive this module drive that guard (devil M4).

import type { NotionState } from "@notion-db/object-database";
import type { PageCacheStorage } from "@/store/pageStore.helpers";
import type { DurableCopy, DurableCopyMode, LoadedCopy } from "./knownDatabaseDurableCopy";
import { createUnloadJournalWriter, type JournalBase, type UnloadJournalWriter } from "./knownDatabaseJournal";
import { objectDatabasePushRecord, pushDirtyObjectDatabases, seedObjectDatabasePushRecord } from "./objectDatabaseBridgeSync";
import type { PushRecordSink } from "./objectDatabasePushRecord";

export interface KnownDatabasePersistenceDeps {
  durable: DurableCopy;
  /** Replaces the whole store with the stored text, or with the seed when there is none (I9). */
  load(text: string | null): void;
  getLiveState(): NotionState;
  serialize(state: NotionState): string;
  getSeedIds(): ReadonlySet<string>;
  getDeletedPageIds(): ReadonlySet<string>;
  reportCommit(isKept: boolean): void;
  warnReadOnly(): void;
  /** This origin's localStorage and this tab's id, for the unload journal (ADR 0055); none → no journal. */
  unloadJournal?: { storage: PageCacheStorage | undefined; tabId: string };
}

export interface KnownDatabasePersistence {
  /** Resolves once the stored copy is in the store and the push record is seeded. */
  ready: Promise<void>;
  mode(): DurableCopyMode | "pending";
  /** False before readiness and in a pull-only session. */
  canWrite(): boolean;
  /** Mode idb only: commits `state`, then pushes the live state. pushNow (pagehide) pushes
   *  at once, because nothing after an unload is awaited. Other modes keep their own writer. */
  flush(state: NotionState, pushNow: boolean): void;
  /** Mode idb only: writes this tab's unload journal. False when the unload must not push. */
  writeUnloadJournal(): boolean;
  forgetUnloadJournal(): void;
}

const PULL_ONLY: PushRecordSink = { isPullOnly: true, recordChanged: () => undefined, reset: () => undefined };

interface Session {
  readonly deps: KnownDatabasePersistenceDeps;
  mode: DurableCopyMode | "pending";
  /** The record version the durable copy holds, as far as this tab wrote it. */
  storedVersion: number;
  /** The copy read at readiness, as the live state it became; null without a stored copy. */
  loadedBase: JournalBase | null;
  journal: UnloadJournalWriter | null;
}

// I2: read when the push runs. A state captured before the commit await still holds the databases
// a hydrate replaced during that await, and would push them back over the server's copies.
const pushLive = (deps: KnownDatabasePersistenceDeps): void => {
  pushDirtyObjectDatabases(deps.getLiveState(), deps.getSeedIds(), deps.getDeletedPageIds());
};

const markStored = (session: Session, version: number): void => {
  session.storedVersion = Math.max(session.storedVersion, version);
};

// I1: the stored record only catches up next to this tab's last commit; the copy refuses
// otherwise, and the record then travels with the next commit.
function catchUp(session: Session): void {
  const record = objectDatabasePushRecord();
  const version = record.version;
  if (version === session.storedVersion) return;
  void session.deps.durable.commitRecord(session.deps.getLiveState(), record.snapshot()).then((isStored) => {
    if (isStored) markStored(session, version);
  });
}

function sinkFor(session: Session, mode: DurableCopyMode): PushRecordSink | undefined {
  if (mode === "idb") return { isPullOnly: false, recordChanged: () => catchUp(session), reset: () => undefined };
  return mode === "fallback-flagged" ? PULL_ONLY : undefined; // undefined: the localStorage record
}

function applyLoaded(session: Session, loaded: LoadedCopy): void {
  session.deps.load(loaded.text);
  seedObjectDatabasePushRecord(loaded.record, sinkFor(session, loaded.mode));
  session.storedVersion = objectDatabasePushRecord().version;
  const loadedId = session.deps.durable.ledger().loadedId;
  if (loaded.mode === "idb" && loadedId !== null) session.loadedBase = { id: loadedId, state: session.deps.getLiveState(), record: { ...loaded.record } };
  session.mode = loaded.mode;
  if (loaded.mode === "fallback-flagged") session.deps.warnReadOnly();
}

function flush(session: Session, state: NotionState, pushNow: boolean): void {
  if (session.mode !== "idb") return;
  const { deps } = session;
  const record = objectDatabasePushRecord();
  const version = record.version;
  const committed = deps.durable.commit(state, deps.serialize(state), record.snapshot());
  // J-C5: an unload whose journal could not be stored sends no push; the push without it is N2.
  if (pushNow && writeJournal(session)) pushLive(deps);
  void committed.then((isKept) => {
    if (isKept) markStored(session, version);
    deps.reportCommit(isKept);
    if (!pushNow) pushLive(deps); // a failed commit never stops the push (K9)
    catchUp(session);
  });
}

// J-C4: the legacy and pull-only sessions write no journal; their unload keeps its push.
const writeJournal = (session: Session): boolean => session.mode !== "idb" || (session.journal?.write() ?? true);

function journalFor(session: Session): UnloadJournalWriter | null {
  const target = session.deps.unloadJournal;
  if (!target) return null;
  return createUnloadJournalWriter({
    ...target,
    ledger: () => session.deps.durable.ledger(),
    loadedBase: () => session.loadedBase,
    live: () => session.deps.getLiveState(),
    deleted: () => session.deps.getDeletedPageIds(),
    record: objectDatabasePushRecord,
  });
}

export function createKnownDatabasePersistence(deps: KnownDatabasePersistenceDeps): KnownDatabasePersistence {
  const session: Session = { deps, mode: "pending", storedVersion: 0, loadedBase: null, journal: null };
  session.journal = journalFor(session);
  return {
    ready: deps.durable.ready.then((loaded) => applyLoaded(session, loaded)),
    mode: () => session.mode,
    canWrite: () => session.mode === "idb" || session.mode === "fallback-legacy",
    flush: (state, pushNow) => flush(session, state, pushNow),
    writeUnloadJournal: () => writeJournal(session),
    forgetUnloadJournal: () => session.journal?.forget(),
  };
}

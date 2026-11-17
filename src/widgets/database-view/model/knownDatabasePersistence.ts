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
import type { DurableCopy, DurableCopyMode, LoadedCopy } from "./knownDatabaseDurableCopy";
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
}

const PULL_ONLY: PushRecordSink = { isPullOnly: true, recordChanged: () => undefined, reset: () => undefined };

interface Session {
  readonly deps: KnownDatabasePersistenceDeps;
  mode: DurableCopyMode | "pending";
  /** The record version the durable copy holds, as far as this tab wrote it. */
  storedVersion: number;
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
  session.mode = loaded.mode;
  if (loaded.mode === "fallback-flagged") session.deps.warnReadOnly();
}

function flush(session: Session, state: NotionState, pushNow: boolean): void {
  if (session.mode !== "idb") return;
  const { deps } = session;
  const record = objectDatabasePushRecord();
  const version = record.version;
  const committed = deps.durable.commit(state, deps.serialize(state), record.snapshot());
  if (pushNow) pushLive(deps);
  void committed.then((isKept) => {
    if (isKept) markStored(session, version);
    deps.reportCommit(isKept);
    if (!pushNow) pushLive(deps); // a failed commit never stops the push (K9)
    catchUp(session);
  });
}

export function createKnownDatabasePersistence(deps: KnownDatabasePersistenceDeps): KnownDatabasePersistence {
  const session: Session = { deps, mode: "pending", storedVersion: 0 };
  return {
    ready: deps.durable.ready.then((loaded) => applyLoaded(session, loaded)),
    mode: () => session.mode,
    canWrite: () => session.mode === "idb" || session.mode === "fallback-legacy",
    flush: (state, pushNow) => flush(session, state, pushNow),
  };
}

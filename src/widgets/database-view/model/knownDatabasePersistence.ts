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
// committed by this tab. Every push sends the live state, never a copy captured before an await.

import type { NotionState } from "@notion-db/object-database";
import type { DurableCopy, DurableCopyMode, LoadedCopy } from "./knownDatabaseDurableCopy";
import { objectDatabasePushRecord, seedObjectDatabasePushRecord } from "./objectDatabaseBridgeSync";
import type { PushRecordSink } from "./objectDatabasePushRecord";

export interface KnownDatabasePersistenceDeps {
  durable: DurableCopy;
  /** Replaces the whole store with the stored text, or with the seed when there is none (I9). */
  load(text: string | null): void;
  getLiveState(): NotionState;
  serialize(state: NotionState): string;
  /** Pushes the store's state as it is when called (I2). */
  pushLive(): void;
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

export function createKnownDatabasePersistence(deps: KnownDatabasePersistenceDeps): KnownDatabasePersistence {
  let mode: DurableCopyMode | "pending" = "pending";
  let storedVersion = 0;

  // I1: the stored record only catches up next to this tab's last commit; the copy refuses
  // otherwise, and the record then travels with the next commit.
  const catchUp = (): void => {
    const record = objectDatabasePushRecord();
    const version = record.version;
    if (version === storedVersion) return;
    void deps.durable.commitRecord(deps.getLiveState(), record.snapshot()).then((isStored) => {
      if (isStored) storedVersion = Math.max(storedVersion, version);
    });
  };

  const sinkFor = (loadedMode: DurableCopyMode): PushRecordSink | undefined => {
    if (loadedMode === "idb") return { isPullOnly: false, recordChanged: catchUp, reset: () => undefined };
    return loadedMode === "fallback-flagged" ? PULL_ONLY : undefined;
  };

  const applyLoaded = (loaded: LoadedCopy): void => {
    deps.load(loaded.text);
    seedObjectDatabasePushRecord(loaded.record, sinkFor(loaded.mode));
    storedVersion = objectDatabasePushRecord().version;
    mode = loaded.mode;
    if (mode === "fallback-flagged") deps.warnReadOnly();
  };

  const flush = (state: NotionState, pushNow: boolean): void => {
    if (mode !== "idb") return;
    const record = objectDatabasePushRecord();
    const version = record.version;
    const committed = deps.durable.commit(state, deps.serialize(state), record.snapshot());
    if (pushNow) deps.pushLive();
    void committed.then((isKept) => {
      if (isKept) storedVersion = Math.max(storedVersion, version);
      deps.reportCommit(isKept);
      if (!pushNow) deps.pushLive(); // a failed commit never stops the push (K9)
      catchUp();
    });
  };

  return {
    ready: deps.durable.ready.then(applyLoaded),
    mode: () => mode,
    canWrite: () => mode === "idb" || mode === "fallback-legacy",
    flush,
  };
}

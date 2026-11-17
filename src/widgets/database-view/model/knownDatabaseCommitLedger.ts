/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   knownDatabaseCommitLedger.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Every stored id this tab's copy may hold next (groot ADR 0055 J-C1). An IndexedDB commit started
// at unload is lost on navigation (I10, 20/20), and one started a moment earlier may still land,
// so the unload journal names all of them: the id read at readiness, every resolved commit, and
// every pending one. The durable copy's record gate reads its last commit from here too.

export type RecordMap = Readonly<Record<string, string>>;

export interface CommitSnapshot {
  readonly id: string;
  readonly stateRef: object;
  readonly record: RecordMap;
}

export interface CommitLedger {
  /** The id the readiness transaction read or wrote; null when the store held no copy. */
  readonly loadedId: string | null;
  readonly resolvedIds: readonly string[];
  /** This tab's last completed commit, with the record stored next to it now. */
  readonly lastResolved: CommitSnapshot | null;
  readonly pending: readonly CommitSnapshot[];
}

export interface CommitLedgerTracker {
  view(): CommitLedger;
  readonly lastResolved: CommitSnapshot | null;
  readonly pendingCount: number;
  loaded(id: string | null): void;
  started(snapshot: CommitSnapshot): void;
  settled(id: string, isKept: boolean): void;
  recordStored(id: string, record: RecordMap): void;
}

interface Entries {
  loadedId: string | null;
  resolvedIds: string[];
  lastResolved: CommitSnapshot | null;
  pending: Map<string, CommitSnapshot>;
}

function settle(entries: Entries, id: string, isKept: boolean): void {
  const snapshot = entries.pending.get(id);
  entries.pending.delete(id);
  if (!isKept || !snapshot) return;
  entries.resolvedIds.push(id);
  entries.lastResolved = snapshot;
}

export function createCommitLedger(): CommitLedgerTracker {
  const entries: Entries = { loadedId: null, resolvedIds: [], lastResolved: null, pending: new Map() };
  return {
    view: () => ({ ...entries, resolvedIds: [...entries.resolvedIds], pending: [...entries.pending.values()] }),
    get lastResolved() { return entries.lastResolved; },
    get pendingCount() { return entries.pending.size; },
    loaded: (id) => { entries.loadedId = id; },
    started: (snapshot) => { entries.pending.set(snapshot.id, snapshot); },
    settled: (id, isKept) => settle(entries, id, isKept),
    recordStored: (id, record) => {
      if (entries.lastResolved?.id === id) entries.lastResolved = { ...entries.lastResolved, record };
    },
  };
}

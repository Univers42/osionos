/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   knownDatabaseJournal.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The unload journal (groot ADR 0055 J-C1, J-C2, J-C5). An IndexedDB commit started at unload is
// lost on navigation (I10, 20/20) while the push it races still lands, so the next load would push
// its older copy over the newer server row (N2). A synchronous localStorage write survives; it
// carries every database that differs from any copy the store may hold next, under this tab's own
// key, so two tabs never overwrite each other's journal (T7).

import type { NotionState } from "@notion-db/object-database";
import { setItemEvictingPageCaches, type PageCacheStorage } from "@/store/pageStore.helpers";
import type { RecordMap } from "./knownDatabaseCommitLedger";
import { hashSlice, sliceAllDatabases } from "./objectDatabaseSlice";

export const KDS_JOURNAL_KEY_PREFIX = "osionos.kds.journal.v1.";
export const KDS_JOURNAL_CHAR_CAP = 1_000_000;

export const journalKey = (tabId: string): string => `${KDS_JOURNAL_KEY_PREFIX}${tabId}`;

/** A copy the store may hold when the next load reads it. */
export interface JournalBase {
  readonly id: string;
  readonly state: NotionState;
  readonly record: RecordMap;
}

export interface UnloadJournal {
  readonly bases: readonly string[];
  readonly tabId: string;
  readonly writtenAt: number;
  readonly slices: Readonly<Record<string, NotionState>>;
  readonly record: Readonly<Record<string, string>>;
}

export interface JournalInput {
  readonly tabId: string;
  /** Every id the store may hold next (the ledger's), named in the journal. */
  readonly baseIds: readonly string[];
  /** The bases whose contents can still land, compared against the live state. */
  readonly landable: readonly JournalBase[];
  readonly live: NotionState;
  readonly record: RecordMap;
}

const baseHashes = new WeakMap<NotionState, Map<string, string>>();

// A base's state is the same object at every unload until another commit lands, so its slice
// hashes are computed once per state, not once per write.
function hashesOf(state: NotionState): Map<string, string> {
  let hashes = baseHashes.get(state);
  if (!hashes) {
    hashes = new Map([...sliceAllDatabases(state)].map(([dbKey, slice]) => [dbKey, hashSlice(slice)]));
    baseHashes.set(state, hashes);
  }
  return hashes;
}

function differsFromAnyBase(dbKey: string, hash: string, input: JournalInput): boolean {
  return input.landable.some((base) => hashesOf(base.state).get(dbKey) !== hash || base.record[dbKey] !== input.record[dbKey]);
}

/** The journal for this unload, or null when no database differs from any base (or none exists). */
export function buildUnloadJournal(input: JournalInput): UnloadJournal | null {
  if (input.landable.length === 0) return null;
  const slices: Record<string, NotionState> = {};
  const record: Record<string, string> = {};
  for (const [dbKey, slice] of sliceAllDatabases(input.live)) {
    if (!differsFromAnyBase(dbKey, hashSlice(slice), input)) continue;
    slices[dbKey] = slice;
    const entry = input.record[dbKey];
    if (entry !== undefined) record[dbKey] = entry;
  }
  if (Object.keys(slices).length === 0) return null;
  return { bases: [...input.baseIds], tabId: input.tabId, writtenAt: Date.now(), slices, record };
}

/** Caveat: an estimate of the origin quota a value costs: browsers that store UTF-16 charge every
 *  character 2 bytes, so a Latin-1 count under-reports there; the cap leaves room for that. */
export function storedLength(text: string): number {
  let length = text.length;
  for (let index = 0; index < text.length; index += 1) if (text.charCodeAt(index) > 0xff) length += 1;
  return length;
}

export function forgetUnloadJournal(storage: PageCacheStorage, tabId: string): void {
  try {
    storage.removeItem(journalKey(tabId));
  } catch {
    // Storage that refuses a removal leaves a journal whose bases decide whether it ever applies.
  }
}

/** Caveat: the 1,000,000-character cap is a budget, not the origin's measured free space (about
 *  5 MiB, shared with the page caches): under it the write can still be refused, and that case is
 *  the refused branch. Over the cap or refused, this tab's older journal goes too, and the caller
 *  must not push at pagehide (J-C5): a push without a journal is the N2 revert. */
export function storeUnloadJournal(storage: PageCacheStorage, journal: UnloadJournal): boolean {
  const text = JSON.stringify(journal);
  const isStored = storedLength(text) <= KDS_JOURNAL_CHAR_CAP && setItemEvictingPageCaches(journalKey(journal.tabId), text, storage);
  if (!isStored) forgetUnloadJournal(storage, journal.tabId);
  return isStored;
}

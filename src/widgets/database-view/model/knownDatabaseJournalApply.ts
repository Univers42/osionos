/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   knownDatabaseJournalApply.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The readiness half of the unload journal (groot ADR 0055 J-C3). Only a journal naming the id the
// store holds describes edits made on top of that copy; one naming another id would lay an older
// window over a newer copy, so it is removed unapplied. A stored record entry that already equals
// the hash of the journal's slice is an ack that landed after the journal was written (T8): taking
// the journal's older entry would read the database dirty and push it over a newer server row. The
// journals' tombstones are unioned into the stored ones (J-C10): a database is never removed.

import type { NotionState } from "@notion-db/object-database";
import type { PageCacheStorage } from "@/store/pageStore.helpers";
import { readDeletedPageIds, type PersistedKnownDatabaseState } from "./knownDatabasePersistedState";
import { KDS_JOURNAL_KEY_PREFIX, type UnloadJournal } from "./knownDatabaseJournal";
import { hashSlice, withReplacedSlices } from "./objectDatabaseSlice";

export interface StoredCopy {
  readonly id: string;
  readonly text: string;
  readonly record: Readonly<Record<string, string>>;
}

export interface MergedCopy {
  readonly text: string;
  readonly record: Record<string, string>;
}

export interface ReadinessJournals {
  /** The stored copy with every journal naming its id applied, or null when none does. */
  merge(stored: StoredCopy): MergedCopy | null;
  /** Removes the journals the last merge read, once the transaction that ran it resolved. */
  discard(): void;
}

interface FoundJournal {
  readonly key: string;
  readonly raw: string;
  readonly journal: UnloadJournal | null;
}

interface Winner {
  readonly slice: NotionState;
  readonly entry: string | undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringList = (value: unknown): boolean => Array.isArray(value) && value.every((item) => typeof item === "string");

function isSlice(value: unknown): value is NotionState {
  return isRecord(value) && isRecord(value.databases) && isRecord(value.pages) && isRecord(value.views);
}

// Another document wrote this text: anything not shaped like a journal never applies.
function parseJournal(raw: string): UnloadJournal | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !isStringList(value.bases) || !isStringList(value.deletedPages)) return null;
    if (typeof value.writtenAt !== "number" || !isRecord(value.slices) || !isRecord(value.record)) return null;
    if (!Object.values(value.slices).every(isSlice) || !Object.values(value.record).every((hash) => typeof hash === "string")) return null;
    return value as unknown as UnloadJournal;
  } catch {
    return null;
  }
}

function readJournals(storage: PageCacheStorage): FoundJournal[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(KDS_JOURNAL_KEY_PREFIX)) keys.push(key);
  }
  return keys.flatMap((key) => {
    const raw = storage.getItem(key);
    return raw === null ? [] : [{ key, raw, journal: parseJournal(raw) }];
  });
}

function winnersFor(matching: readonly UnloadJournal[]): Map<string, Winner> {
  const winners = new Map<string, Winner>();
  const ordered = [...matching].sort((left, right) => left.writtenAt - right.writtenAt);
  for (const journal of ordered) {
    for (const [dbKey, slice] of Object.entries(journal.slices)) winners.set(dbKey, { slice, entry: journal.record[dbKey] });
  }
  return winners;
}

function mergedRecord(stored: Readonly<Record<string, string>>, winners: ReadonlyMap<string, Winner>): Record<string, string> {
  const record = { ...stored };
  for (const [dbKey, { slice, entry }] of winners) {
    if (record[dbKey] === hashSlice(slice)) continue;
    if (entry === undefined) delete record[dbKey];
    else record[dbKey] = entry;
  }
  return record;
}

function mergedText(text: string, winners: ReadonlyMap<string, Winner>, matching: readonly UnloadJournal[]): string {
  const stored = JSON.parse(text) as PersistedKnownDatabaseState;
  const state = { databases: stored.databases ?? {}, pages: stored.pages ?? {}, views: stored.views ?? {} } as NotionState;
  const slices = new Map([...winners].map(([dbKey, winner]) => [dbKey, winner.slice]));
  const deleted = readDeletedPageIds(stored);
  for (const journal of matching) for (const pageId of journal.deletedPages) deleted.add(pageId);
  const tombstones = deleted.size === 0 ? {} : { deletedPages: [...deleted] };
  return JSON.stringify({ ...stored, ...withReplacedSlices(state, slices), ...tombstones });
}

function mergeInto(stored: StoredCopy, found: readonly FoundJournal[]): MergedCopy | null {
  const matching = found.flatMap(({ journal }) => (journal?.bases.includes(stored.id) ? [journal] : []));
  if (matching.length === 0) return null;
  const winners = winnersFor(matching);
  return { text: mergedText(stored.text, winners, matching), record: mergedRecord(stored.record, winners) };
}

// Compare-and-delete: a tab that rewrote its key since the read owns the newer text.
function removeRead(storage: PageCacheStorage, found: readonly FoundJournal[]): void {
  for (const { key, raw } of found) {
    if (storage.getItem(key) === raw) storage.removeItem(key);
  }
}

export function openReadinessJournals(storage: PageCacheStorage | undefined): ReadinessJournals {
  let found: FoundJournal[] = [];
  return {
    merge: (stored) => {
      try {
        found = storage ? readJournals(storage) : [];
        return mergeInto(stored, found);
      } catch {
        found = [];
        return null;
      }
    },
    discard: () => {
      try {
        if (storage) removeRead(storage, found);
      } catch {
        // A journal left in place no longer names the stored id, so the next readiness removes it.
      }
      found = [];
    },
  };
}

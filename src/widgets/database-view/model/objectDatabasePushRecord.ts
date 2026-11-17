/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   objectDatabasePushRecord.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The hash of each database as this tab last pushed or pulled it, held in memory (devil I4).
// Every push result updates this one record per item: a copy taken when a batch starts and saved
// when it ends would erase what a hydrate set in between. The version lets the durable copy know
// whether the stored record is behind the one in memory.

export type PushRecordMap = Record<string, string>;

export interface PushRecord {
  /** Moves each time an entry changes. */
  readonly version: number;
  snapshot(): PushRecordMap;
  set(dbKey: string, hash: string): void;
  delete(dbKey: string): void;
  replace(map: Readonly<PushRecordMap>): void;
}

/** Where the record goes after it changed: localStorage (legacy), the durable copy, or nowhere
 *  in a pull-only session. */
export interface PushRecordSink {
  readonly isPullOnly: boolean;
  recordChanged(record: Readonly<PushRecordMap>): void;
  reset(): void;
}

function hasSameEntries(left: Readonly<PushRecordMap>, right: Readonly<PushRecordMap>): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => right[key] === left[key]);
}

export function createPushRecord(initial: Readonly<PushRecordMap> = {}): PushRecord {
  let entries: PushRecordMap = { ...initial };
  let version = 0;
  const change = (next: PushRecordMap): void => {
    if (hasSameEntries(entries, next)) return;
    entries = next;
    version += 1;
  };
  return {
    get version() { return version; },
    snapshot: () => ({ ...entries }),
    set: (dbKey, hash) => change({ ...entries, [dbKey]: hash }),
    delete: (dbKey) => {
      if (!(dbKey in entries)) return;
      const next = { ...entries };
      delete next[dbKey];
      change(next);
    },
    replace: (map) => change({ ...map }),
  };
}

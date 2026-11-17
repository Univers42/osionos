/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   knownDatabaseDurableStore.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The browser side of the known-database durable copy: the IndexedDB database it lives in, and
// the localStorage it migrates from and keeps its unload journals in.

import { openIndexedKeyValueStore } from "@/shared/lib/key-value-store/indexedKeyValueStore";
import { openDurableCopy, type DurableCopy } from "./knownDatabaseDurableCopy";
import { openReadinessJournals } from "./knownDatabaseJournalApply";
import { OBJECT_DB_WRITER_ID } from "./objectDatabaseRealtime";

const KNOWN_DATABASE_IDB_NAME = "osionos-kds";

function legacyStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined; // a sandboxed frame throws on access: the copy then reads nothing legacy
  }
}

/** The copy this tab commits under its writer id, so a commit is never mistaken for another tab's. */
export function openKnownDatabaseDurableCopy(): DurableCopy {
  return openDurableCopy({
    openStore: () => openIndexedKeyValueStore(KNOWN_DATABASE_IDB_NAME),
    legacy: legacyStorage(),
    tabId: OBJECT_DB_WRITER_ID,
    journals: openReadinessJournals(legacyStorage()),
  });
}

/** Where this tab's unload journal lives: this origin's localStorage, under its writer id. */
export function knownDatabaseUnloadJournal(): { storage: Storage | undefined; tabId: string } {
  return { storage: legacyStorage(), tabId: OBJECT_DB_WRITER_ID };
}

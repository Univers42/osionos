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

// The browser side of the known-database durable copy: the IndexedDB database it lives in, the
// localStorage copy it migrates from, and the page events that must flush it.

import { openIndexedKeyValueStore } from "@/shared/lib/key-value-store/indexedKeyValueStore";
import { openDurableCopy, type DurableCopy } from "./knownDatabaseDurableCopy";
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
  });
}

/** A hidden tab can be discarded without a pagehide (mobile, frozen background tabs), so its
 *  pending state is committed when it is hidden (devil I10). */
export function flushWhenHidden(flush: () => void): void {
  const doc = globalThis.document;
  doc?.addEventListener?.("visibilitychange", () => {
    if (doc.visibilityState === "hidden") flush();
  });
}

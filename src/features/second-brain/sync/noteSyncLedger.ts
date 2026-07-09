/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   noteSyncLedger.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Second-brain note sync ledger. This is now a thin BINDING over the shared,
 * engine-agnostic confirmed-sync primitive (`@/shared/sync/outboxLedger`): it
 * fixes the note localStorage key and re-exports the shared diff + types, so
 * note sync and page sync share ONE implementation. (This file previously
 * duplicated that primitive verbatim — the duplication the engine-agnostic
 * docstring warned about.) The key is unchanged, so existing note ledgers in
 * localStorage load identically — no migration, byte-for-byte same behavior.
 */

import {
  computeSyncActions,
  loadLedger as loadLedgerForKey,
  saveLedger as saveLedgerForKey,
  type SyncActions,
  type SyncLedger,
} from "@/shared/sync/outboxLedger";

const LEDGER_KEY = "osio-sb-synced-notes";

export { computeSyncActions };
export type { SyncActions, SyncLedger };

/** Load the confirmed-sync ledger for second-brain notes (pageId → last stamp). */
export function loadLedger(): SyncLedger {
  return loadLedgerForKey(LEDGER_KEY);
}

/** Persist the confirmed-sync ledger for second-brain notes. */
export function saveLedger(ledger: SyncLedger): void {
  saveLedgerForKey(LEDGER_KEY, ledger);
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   noteSyncLedger.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The confirmed-sync ledger = the OUTBOX, by difference. It records, per note, the
 * stamp (content+attributes hash) we have SUCCESSFULLY written to the BaaS. A note
 * is "pending" (in the outbox) whenever its desired stamp differs from its ledger
 * entry, or it was synced before but is now gone (needs delete). Crucially the
 * ledger is only advanced AFTER the server confirms a write — so if the server is
 * down, the write stays pending and is retried; nothing made offline is lost.
 *
 * The ledger persists to localStorage so pending writes survive a reload during an
 * outage. zustand holds the working notes (durable cache); this tracks what still
 * needs to reach the server.
 */

const LEDGER_KEY = "osio-sb-synced-notes";

/** pageId → last stamp CONFIRMED-written to the BaaS. */
export type SyncLedger = Record<string, string>;

export function loadLedger(): SyncLedger {
  try {
    const raw = globalThis.localStorage?.getItem(LEDGER_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as SyncLedger) : {};
  } catch {
    return {};
  }
}

export function saveLedger(ledger: SyncLedger): void {
  try {
    globalThis.localStorage?.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    // localStorage may be unavailable (quota / private mode) — the ledger then
    // lives only in memory for this session, still correct within it.
  }
}

export interface SyncActions {
  /** pageIds whose desired stamp differs from the confirmed ledger → (re)publish. */
  toPublish: string[];
  /** pageIds confirmed-synced before but no longer present → delete from the BaaS. */
  toUnpublish: string[];
}

/**
 * Diff the desired note stamps (from the page store) against the confirmed-sync
 * ledger. Pure — the orchestrator performs the writes and advances the ledger only
 * on success.
 */
export function computeSyncActions(desired: ReadonlyMap<string, string>, ledger: SyncLedger): SyncActions {
  const toPublish: string[] = [];
  for (const [id, stamp] of desired) {
    if (ledger[id] !== stamp) toPublish.push(id);
  }
  const toUnpublish: string[] = [];
  for (const id of Object.keys(ledger)) {
    if (!desired.has(id)) toUnpublish.push(id);
  }
  return { toPublish, toUnpublish };
}

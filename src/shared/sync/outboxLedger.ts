/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   outboxLedger.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Generic confirmed-sync ledger (the OUTBOX, by difference). It records, per entity id,
 * the stamp last SUCCESSFULLY written to the server. An entity is "pending" whenever its
 * desired stamp differs from its ledger entry, or it was synced and is now gone. The
 * ledger persists to localStorage so pending writes survive a reload during an outage,
 * and it is only advanced AFTER the server confirms a write — so nothing made offline is
 * lost. Engine-agnostic: each caller (notes, pages) passes its own storage key.
 */

/** entityId → last stamp CONFIRMED-written to the server. */
export type SyncLedger = Record<string, string>;

export function loadLedger(key: string): SyncLedger {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as SyncLedger) : {};
  } catch {
    return {};
  }
}

export function saveLedger(key: string, ledger: SyncLedger): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(ledger));
  } catch {
    // localStorage may be unavailable (quota / private mode) — the ledger then lives
    // only in memory for this session, still correct within it.
  }
}

export interface SyncActions {
  /** ids whose desired stamp differs from the confirmed ledger → (re)publish. */
  toPublish: string[];
  /** ids confirmed-synced before but no longer present → drop (delete or forget). */
  toUnpublish: string[];
}

/**
 * Diff the desired stamps (from a store) against the confirmed-sync ledger. Pure — the
 * orchestrator performs the writes and advances the ledger only on success.
 */
export function computeSyncActions(
  desired: ReadonlyMap<string, string>,
  ledger: SyncLedger,
): SyncActions {
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

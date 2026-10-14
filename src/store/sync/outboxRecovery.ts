/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   outboxRecovery.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the outbox DOES with a publish the bridge refused — the decisions only, no
 * stores, no api client, no React, so the canvas runner can test them (the client
 * reads import.meta.env at load and cannot run there).
 *
 * MAX_RECOVERIES_PER_FLUSH bounds the recovery work one flush may spend: an offline
 * flush that recovers every page in the batch would block the debounce forever.
 * OUTBOX_RECOVERING_KEY marks the pages a recovery in flight still owns; the flush
 * loop writes the mark, hydrate reads it and lets the local copy win the merge.
 */

import type { RecoveryOutcome } from "./refusedEditRecovery";

export const MAX_RECOVERIES_PER_FLUSH = 5;
export const OUTBOX_RECOVERING_KEY = "osio:pages:outbox:recovering";

/**
 * The toast for a PARTIALLY applied PATCH: the bridge wrote what it may and declined
 * the rest. Null when nothing was declined. O(1).
 */
export function ignoredWarning(
  title: string,
  ignored: string[],
): { kind: "warning"; title: string; description: string } | null {
  if (ignored.length === 0) return null;
  const name = title || "Untitled";
  return {
    kind: "warning",
    title: `Some changes to “${name}” were not saved`,
    // A parent that no longer exists is dropped for EVERYBODY; moving a page
    // between workspaces or changing who can see it stays owner-only.
    // Ponytail: only an `ignored` of exactly ["parentPageId"] reads as the parent
    // case, so a batch that declines the parent AND another field tells the reader
    // the wrong reason — owner-only wording for a parent that simply vanished.
    description: ignored.length === 1 && ignored[0] === "parentPageId"
      ? "The new parent page is not available."
      : "Only the page owner can move it to another workspace or change who can see it.",
  };
}

/**
 * Fold one recovery outcome into the ledgers and say whether the flush moves on.
 * "failed" touches NOTHING: the recovering mark stays (so hydrate keeps the local
 * copy) and the ledger entry stays (so the refused edit is retried next cycle).
 * O(1).
 */
export function applyRecoveryOutcome(
  ledger: Record<string, string>,
  recovering: Record<string, string>,
  id: string,
  outcome: RecoveryOutcome,
  markRefused: (id: string) => void,
): "continue" | "stop" {
  if (outcome === "failed") return "stop";
  delete recovering[id];
  markRefused(id);
  delete ledger[id];
  return "continue";
}

/**
 * The ids hydrate must let the LOCAL copy win for: a recovery in flight holds the
 * only copy of a refused edit, so a newer server copy would destroy it.
 * O(r) over the marks. The ledger comes from localStorage, so only this object's
 * own keys are read: a "__proto__" marker planted there never reaches the Set.
 */
export function recoveringIds(recovering: Record<string, string>): Set<string> {
  return new Set(Object.keys(recovering));
}

/**
 * Drop the marks of pages the outbox has settled: published, recovered, or no longer
 * desired. A mark nothing clears (a PATCH that succeeds again after a role is
 * restored, a tab closed mid-recovery) would make hydrate keep a stale local copy
 * forever. Returns whether a mark went, so the caller writes only then. O(k).
 */
export function clearRecoveringMarks(recovering: Record<string, string>, ids: Iterable<string>): boolean {
  let changed = false;
  for (const id of ids) {
    if (!Object.hasOwn(recovering, id)) continue;
    delete recovering[id];
    changed = true;
  }
  return changed;
}

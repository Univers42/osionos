/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageConflict.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The conflict path: what the outbox does with a 409 that carries the server's copy.
 *
 *   1. The merge: the base (the server copy the client last saw), the local copy and the
 *      server's copy, three ways, by block id (./mergePageContent). Both sides' edits
 *      survive; a block they both changed keeps both variants.
 *   2. The merged content goes into the STORE, through the store's own page update
 *      action, so the editor re-renders what was saved.
 *   3. The re-send, pinned to the version the 409 carried. The server's copy is the new
 *      base, so the re-send is a normal write on top of it. A 409 on the re-send is one
 *      more writer that landed first: steps 1–3 run again on top of it, at most
 *      MAX_REBASES times. Three editors on one page made a second 409 routine, and
 *      sending the edit to a copy then emptied the writer's screen (rtconc, 2026-10-27).
 *   4. A 409 past the bound, or a merge that could not be done (no base — after a
 *      reload the client has the version but not the content it belongs to), goes to
 *      the loss-safe COPY path: the local edit becomes a copy in the private workspace,
 *      the server's copy stays untouched, and the reader is told where the edit went
 *      (C25, C28).
 *
 * Each round merges the store's LATEST copy, not the copy the flush started with: the
 * merged content replaces the store's, so keystrokes typed during the PATCH round-trip
 * would otherwise be overwritten.
 *
 * A conflict is NOT a failure: it never stops the batch and never backs the flush off.
 * The other pages of the flush go on (C28).
 */

import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";
import { mergePageContent } from "./mergePageContent";
import { baseFor, setBase } from "./pageBase";
import type { PublishOutcome, VersionConflict } from "./publishResult";
import type { RecoveryOutcome } from "./refusedEditRecovery";

/** What the conflict path needs from the world. */
export interface ConflictDeps {
  /** Apply the merged content to the store — the store's own page update action. */
  applyContent(pageId: string, content: Block[]): PageEntry | null;
  /** The store's current copy of the page (null: use the copy the conflict started from). */
  latest?(pageId: string): PageEntry | null;
  /** Re-send the page under the server's version. */
  resend(page: PageEntry): Promise<PublishOutcome>;
  /** The loss-safe copy path: the local edit becomes a copy, the server's copy stays. */
  copyPath(page: PageEntry): Promise<RecoveryOutcome>;
  /** A notice for the reader — not blocking, the reader may keep working. */
  notify(notice: { kind: "warning" | "error"; title: string; description: string }): void;
}

/** How the conflict ended. */
export type ConflictOutcome =
  /** The merged content was sent and the server took it. */
  | { kind: "merged"; page: PageEntry; conflicts: boolean }
  /** The local edit went to a copy; the server's copy stands. */
  | { kind: "copied" }
  /** Transient: the page stays pending and the next flush tries again. */
  | { kind: "failed" };

/**
 * Re-sends after the first 409 before the copy path takes over. Every round is one PATCH,
 * so a page costs at most 1 + MAX_REBASES PATCHes per flush.
 * Caveat: a bound, not a guarantee — more writers than this landing within one round-trip
 * each still send the edit to a copy (no loss, but it leaves the page).
 */
export const MAX_REBASES = 4;

/**
 * Resolve one conflict. The page is the client's own copy; the conflict is what the
 * 409 carried (the server's version and content).
 */
export async function resolvePageConflict(
  page: PageEntry,
  conflict: VersionConflict,
  deps: ConflictDeps,
): Promise<ConflictOutcome> {
  // A page whose content was never loaded has no local side to merge: the write that
  // was refused carried no content either, so there is nothing to save. It stays
  // pending and the next flush tries again.
  if (page.content === undefined) return { kind: "failed" };
  // The store's copy when it has content, else the copy this resolution holds: what the
  // reader has NOW goes into every merge and every copy.
  const freshest = (held: PageEntry): PageEntry => {
    const latest = deps.latest?.(page._id);
    return latest?.content === undefined ? held : latest;
  };
  let local = page;
  let server = conflict;
  let notified = false;
  for (let round = 0; round < MAX_REBASES; round++) {
    local = freshest(local);
    const merged = mergePageContent(baseFor(local).content, local.content ?? [], server.content);
    if (merged.status === "unresolved") {
      // No base (a reload): the merge must not guess. The server's copy stands and the
      // local edit goes to a copy — the server's copy is never overwritten (C25).
      return copied(await deps.copyPath(local));
    }
    // The merged content goes into the store first: the editor shows what was saved and
    // the re-send carries exactly that.
    const applied = deps.applyContent(page._id, merged.content);
    // The store refused the merge (the reader lost write access mid-flush): re-sending
    // what it holds would put the UNMERGED copy over the other writers' edits.
    if (applied && !sameContent(applied.content, merged.content)) return { kind: "failed" };
    const mergedPage = applied ?? { ...local, content: merged.content };
    // The server's copy is the new base: the re-send is pinned to the version it is at.
    setBase(page._id, server.version, server.content);
    if (merged.status === "conflicts" && !notified) {
      notified = true;
      deps.notify({
        kind: "warning",
        title: `Someone edited “${page.title || "Untitled"}” at the same time`,
        description: "Both versions were kept — theirs sits right next to yours.",
      });
    }
    const outcome = await deps.resend(mergedPage);
    if (outcome.result === "ok") return { kind: "merged", page: mergedPage, conflicts: notified };
    if (outcome.result !== "conflict") return { kind: "failed" };
    local = mergedPage;
    // A 409 without the server's copy cannot be merged: the copy path keeps the edit.
    if (!outcome.conflict) return copied(await deps.copyPath(freshest(mergedPage)));
    server = outcome.conflict;
  }
  // Past the bound: the server keeps moving under the re-send. The copy path keeps the
  // local edit — and the server's copy — safe (C28).
  return copied(await deps.copyPath(freshest(local)));
}

function sameContent(a: Block[] | undefined, b: Block[]): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function copied(outcome: RecoveryOutcome): ConflictOutcome {
  return outcome === "failed" ? { kind: "failed" } : { kind: "copied" };
}

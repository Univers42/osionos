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
 *   3. The re-send: ONCE, pinned to the version the 409 carried. The server's copy is
 *      the new base, so the re-send is a normal write on top of it.
 *   4. A second 409 for the same flush, or a merge that could not be done (no base —
 *      after a reload the client has the version but not the content it belongs to),
 *      goes to the loss-safe COPY path: the local edit becomes a copy in the private
 *      workspace, the server's copy stays untouched, and the reader is told where the
 *      edit went (C25, C28).
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
  const base = baseFor(page);
  const merged = mergePageContent(base.content, page.content, conflict.content);
  if (merged.status === "unresolved") {
    // No base (a reload): the merge must not guess. The server's copy stands and the
    // local edit goes to a copy — the server's copy is never overwritten (C25).
    const outcome = await deps.copyPath(page);
    return outcome === "failed" ? { kind: "failed" } : { kind: "copied" };
  }
  // The merged content goes into the store first: the editor shows what was saved and
  // the re-send carries exactly that.
  const mergedPage = deps.applyContent(page._id, merged.content) ?? { ...page, content: merged.content };
  // The server's copy is the new base: the re-send is pinned to the version it is at.
  setBase(page._id, conflict.version, conflict.content);
  if (merged.status === "conflicts") {
    deps.notify({
      kind: "warning",
      title: `Someone edited “${page.title || "Untitled"}” at the same time`,
      description: "Both versions were kept — theirs sits right next to yours.",
    });
  }
  const outcome = await deps.resend(mergedPage);
  if (outcome.result === "ok") {
    return { kind: "merged", page: mergedPage, conflicts: merged.status === "conflicts" };
  }
  if (outcome.result === "conflict") {
    // A second 409 for the same flush: the server moved again under the re-send. The
    // copy path keeps the local edit — and the server's copy — safe (C28).
    const outcome2 = await deps.copyPath(mergedPage);
    return outcome2 === "failed" ? { kind: "failed" } : { kind: "copied" };
  }
  return { kind: "failed" };
}

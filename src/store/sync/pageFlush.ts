/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageFlush.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One page's turn in the OUTBOX flush: publish it and book what came back. The rules
 * are the flush's, not the transport's:
 *   "ok"       → the ledger advances to this page's stamp.
 *   "conflict" → the 409 path: merge, re-send ONCE, and on a second conflict the local
 *                edit goes to a copy. The batch goes ON — a conflict is not a failure.
 *   "refused"  → 403, "gone" → 404: the edit is recovered (copied), never dropped.
 *   "failed"   → transient (offline / 5xx / 429): STOP the batch and back off.
 *
 * A refused or copied page is booked as FORGOTTEN (its ledger entry goes): the edit it
 * held is no longer the server's business — it is in a copy, or the page is gone.
 */

import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";
import { markPageWriteRefused } from "@/shared/lib/auth/pageAccess";
import { loadLedger } from "@osionos/outbox-ledger";
import type { SyncLedger } from "@osionos/outbox-ledger";
import { resolvePageConflict } from "./pageConflict";
import { pageStamp, saveOutboxLedger } from "./pageStamp";
import { ignoredWarning, OUTBOX_RECOVERING_KEY, applyRecoveryOutcome, clearRecoveringMarks } from "./outboxRecovery";
import type { PublishOutcome } from "./publishResult";
import { recoverRefusedEdit, type RecoveryDeps, type RecoveryOutcome, type RecoveryReason } from "./refusedEditRecovery";

/**
 * One page's turn in the flush. `budget` is shared so the batch stays bounded. Outcomes
 * are booked in `confirmed` / `forgotten`, never on a loaded ledger: the flush applies
 * them to the ledger it reloads after the awaits.
 */
export interface FlushJob {
  page: PageEntry;
  id: string;
  stamp: string;
  confirmed: SyncLedger;
  forgotten: Set<string>;
  budget: { left: number };
}

/** What the flush needs from the world. Injected so the canvas runner can drive it. */
export interface FlushDeps {
  /** Publish the page through the bridge. */
  publish(page: PageEntry): Promise<PublishOutcome>;
  /** The loss-safe copy path's dependencies (the refused-edit recovery). */
  recovery: RecoveryDeps;
  /** The private workspace a copy goes to (null when the viewer has none). */
  privateWorkspaceId(): string | null;
  /** A notice for the reader. Sticky: it never times out of sight. */
  notify(notice: { kind: "warning" | "error"; title: string; description: string; sticky?: boolean }): void;
  /** Apply the merged content to the store — the store's own page update action. */
  applyContent(pageId: string, content: Block[]): PageEntry | null;
}

/**
 * Publish one page and book its outcome. O(1) besides the PATCH itself.
 * A refusal, a missing page or an unmergeable conflict is not dropped here — the work
 * still belongs to the viewer, so it goes through the recovery before anything is
 * forgotten.
 */
export async function publishOutboxPage(job: FlushJob, deps: FlushDeps): Promise<"continue" | "stop"> {
  const { page, id, stamp, confirmed, budget } = job;
  const outcome = await deps.publish(page);
  if (outcome.result === "ok") {
    confirmed[id] = stamp; // advance ONLY on confirm
    const warn = ignoredWarning(page.title, outcome.ignored);
    if (warn) deps.notify({ ...warn, sticky: true });
    return "continue";
  }
  if (outcome.result === "conflict" && outcome.conflict) {
    // A 409 is not a failure: the merge, the one re-send and the copy path happen
    // here, and the rest of the batch goes on (C28).
    const resolved = await resolvePageConflict(page, outcome.conflict, {
      applyContent: deps.applyContent,
      resend: (merged) => deps.publish(merged),
      copyPath: (copied) => recoverToCopy(copied, id, job.forgotten, "conflict", deps),
      notify: deps.notify,
    });
    if (resolved.kind === "merged") {
      confirmed[id] = pageStamp(resolved.page);
      return "continue";
    }
    if (resolved.kind === "copied") return "continue";
    return "stop";
  }
  if (outcome.result === "refused" || outcome.result === "gone") {
    if (budget.left <= 0) return "stop"; // this flush already spent its recoveries
    budget.left -= 1;
    const outcome2 = await recoverToCopy(page, id, job.forgotten, "refused", deps);
    return outcome2 === "failed" ? "stop" : "continue";
  }
  // Transient (offline / 5xx / 429): STOP. Hammering the rest of the batch is what
  // turns a rate-limited server into a self-sustaining 429/502 storm. Back off and
  // resume next cycle — the pages already confirmed above stay advanced.
  return "stop";
}

/**
 * Run the recovery for one refused/gone/conflicted page. The mark is written BEFORE
 * the network call so a hydrate landing mid-recovery keeps the local copy (it holds
 * the only copy of the refused edit), and cleared by applyRecoveryOutcome once the
 * edit is safely moved. O(1) besides the recovery's own GET + POST.
 */
async function recoverToCopy(
  page: PageEntry, id: string, forgotten: Set<string>, reason: RecoveryReason, deps: FlushDeps,
): Promise<RecoveryOutcome> {
  const recovering = loadLedger(OUTBOX_RECOVERING_KEY);
  recovering[id] = new Date().toISOString();
  saveOutboxLedger(OUTBOX_RECOVERING_KEY, recovering);
  const outcome = await recoverRefusedEdit(page, deps.privateWorkspaceId(), deps.recovery, reason);
  // applyRecoveryOutcome books on a ledger: it gets this page's entry alone, and a removal
  // there becomes a `forgotten` booking for the flush to apply.
  const entry: SyncLedger = { [id]: "" };
  const step = applyRecoveryOutcome(entry, recovering, id, outcome, markPageWriteRefused);
  if (!Object.hasOwn(entry, id)) forgotten.add(id);
  saveOutboxLedger(OUTBOX_RECOVERING_KEY, recovering);
  return step === "stop" ? "failed" : outcome;
}

/** A settled page no longer needs hydrate to protect its local copy. O(k). */
export function settleRecoveringMarks(ids: string[]): void {
  if (ids.length === 0) return;
  const recovering = loadLedger(OUTBOX_RECOVERING_KEY);
  if (clearRecoveringMarks(recovering, ids)) saveOutboxLedger(OUTBOX_RECOVERING_KEY, recovering);
}

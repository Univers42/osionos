/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundExec.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Runs one event's planned steps, in order, against the live page tree. The
// planner (inboundPlan.ts) decided everything; this only acts, keeps the ledger,
// and reports. It never throws: a failing step is reported and ends its event.

import { ownerOf } from "@/features/page-file/model/pageFileFacadeTables";
import { archiveIfGone, type StatResult } from "./inboundArchive";
import { createPage, movePage, restorePage } from "./inboundExecTree";
import { ideOutput } from "./ideOutputBus";
import { recordSyncedHash } from "./ideSyncEngine";
import { useIdeSyncConflicts } from "./ideSyncConflicts";

import type { PageFacade } from "../vfs/pageProvider";
import type { InboundStep } from "./inboundPlan";
import type { InboundPending } from "./inboundPending";
import type { LandedMemo } from "./inboundLanded";
import type { ExecView } from "./inboundView";

export interface ExecContext {
  readonly workspaceId: string;
  readonly facade: PageFacade;
  readonly view: ExecView;
  readonly pending: InboundPending;
  readonly landed: LandedMemo;
  restore(pageId: string): Promise<void>;
  stat(path: string): Promise<StatResult>;
}

/** `applied`: an apply step landed (attach's onInbound needs to know). */
export interface ExecOutcome {
  applied: boolean;
  error: string | null;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * The steps of ONE event, in order; the first failing step ends the event (B4:
 * a move that failed after its archive was cancelled leaves the file where the
 * shell put it, unsynced and unrecorded, and says so). Runs inside the event
 * queue and never awaits it (B8): a due archive only ENQUEUES its re-check.
 * O(steps) plus each step's own cost.
 */
export async function executeSteps(steps: readonly InboundStep[], eventPath: string, ctx: ExecContext): Promise<ExecOutcome> {
  let applied = false;
  for (const step of steps) {
    try {
      await runStep(step, ctx);
    } catch (error) {
      ideOutput("fs-sync", failureLine(step, eventPath, messageOf(error)));
      return { applied, error: messageOf(error) };
    }
    applied = applied || step.op === "apply";
  }
  return { applied, error: null };
}

async function runStep(step: InboundStep, ctx: ExecContext): Promise<void> {
  switch (step.op) {
    case "skip":
      if (!step.quiet) ideOutput("fs-sync", `skipped: ${step.reason}`);
      return;
    case "record":
      return recordSyncedHash(ctx.workspaceId, step.path, step.hash);
    case "cancel-archive":
      return ctx.pending.cancel(step.pageId);
    case "schedule-archive":
      return ctx.pending.schedule(step.pageId, step.path, (ticket) => archiveIfGone(ticket, ctx));
    case "deleted-dir":
      return ctx.pending.addDeletedDir({ path: step.path, role: step.role, ownerId: step.ownerId });
    case "restore":
      return restorePage(step.pageId, ctx);
    case "move":
      return movePage(step, ctx);
    case "apply":
      // writeContent is writePage: the file's name keeps the title, the app the
      // surface, the owner the visibility (pinFilePatch, B6).
      await ctx.facade.writeContent(step.pageId, step.text);
      recordSyncedHash(ctx.workspaceId, step.path, step.hash);
      return ctx.landed.remember(step.path, step.hash, step.pageId);
    case "create":
      return createPage(step, ctx);
    case "conflict":
      return reportConflict(step);
  }
}

/** Condition 23: reported under the PAGE's id (a `#meta` names its folder) with the file path. */
function reportConflict(step: Extract<InboundStep, { op: "conflict" }>): void {
  useIdeSyncConflicts.getState().report({
    relPath: step.path, pageId: ownerOf(step.pageId), theirs: step.theirs, theirsHash: step.hash, atMs: Date.now(),
  });
  ideOutput("sync", `CONFLICT: ${step.path} changed on both sides — open the file to resolve`);
}

export function failureLine(step: InboundStep, eventPath: string, reason: string): string {
  const unsynced = "the file stays in the sandbox, unsynced";
  if (step.op === "move") return `${eventPath}: not synced — moving ${step.fromPath} to ${step.toPath} failed (${reason}); ${unsynced}`;
  if (step.op === "restore") return `${eventPath}: not synced — the page could not be restored (${reason}); ${unsynced}`;
  if (step.op === "create") return `${eventPath}: no page created — ${reason}`;
  if (step.op === "apply") return `${eventPath}: not applied — ${reason}`;
  return `${eventPath}: ${step.op} failed — ${reason}`;
}

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
import { useIdeSyncConflicts, type IdeSyncConflict } from "./ideSyncConflicts";

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
  /** Makes every deferred create now: a queued task about to read the tree calls it first. */
  settle(): Promise<void>;
  stat(path: string): Promise<StatResult>;
  /** A directory's answer, never a batched one: archiving a directory cascades onto every page under it. */
  statDir(path: string): Promise<StatResult>;
}

/** `applied`: an apply step landed (attach's onInbound needs to know). `reported`: this
 *  event's outcome is already in front of the user — a conflict entry, or the page-gone
 *  line — so the caller must not report it again (C3b5 C4.1, P5). */
export interface ExecOutcome {
  applied: boolean;
  reported: boolean;
  error: string | null;
}

type ApplyStep = Extract<InboundStep, { op: "apply" }>;

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
  let reported = false;
  for (const step of steps) {
    try {
      await runStep(step, ctx);
    } catch (error) {
      if (step.op === "apply") return { applied, reported: reportRefused(step, eventPath, messageOf(error), ctx), error: messageOf(error) };
      ideOutput("fs-sync", failureLine(step, eventPath, messageOf(error)));
      return { applied, reported, error: messageOf(error) };
    }
    applied = applied || step.op === "apply";
    reported = reported || step.op === "conflict";
  }
  return { applied, reported, error: null };
}

/**
 * Condition 13 on the socket path (C3b5 C4.1, C4.3): an apply the store refused
 * (read-only, archived, a store error) leaves the shell text waiting as a conflict
 * on the page, the ledger untouched — what attach does. A page gone from the tree
 * gets one line instead: no banner can act on it. Always reports. O(1).
 */
function reportRefused(step: ApplyStep, eventPath: string, reason: string, ctx: ExecContext): true {
  const pageId = ownerOf(step.pageId);
  if (ctx.view.pageState(pageId) === undefined) {
    ideOutput("fs-sync", `${eventPath}: not applied — the page is gone; the file stays in the sandbox, unsynced`);
    return true;
  }
  ideOutput("fs-sync", failureLine(step, eventPath, reason));
  surface({ relPath: step.path, pageId, theirs: step.text, theirsHash: step.hash }, `changed in the sandbox but could not be applied (${reason})`);
  return true;
}

async function runStep(step: InboundStep, ctx: ExecContext): Promise<void> {
  switch (step.op) {
    case "skip":
      if (!step.quiet) ideOutput("fs-sync", `skipped: ${step.reason}`);
      return;
    case "record":
      recordSyncedHash(ctx.workspaceId, step.path, step.hash);
      return resolveAgreed(pageAt(step.path, ctx));
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
      resolveAgreed(step.pageId);
      return ctx.landed.remember(step.path, step.hash, step.pageId);
    case "create":
      return createPage(step, ctx);
    case "conflict":
      return reportConflict(step);
  }
}

/** C3b5 C4.2: file and page agree again, so an open conflict's `theirs` is no longer what
 *  the file holds — "take file" would apply that older shell text. Ends the entry. O(1). */
function resolveAgreed(pageId: string | undefined): void {
  if (pageId !== undefined) useIdeSyncConflicts.getState().resolve(ownerOf(pageId));
}

/** The page whose own file is `path`; looked up only while a conflict is open. O(depth). */
function pageAt(path: string, ctx: ExecContext): string | undefined {
  if (Object.keys(useIdeSyncConflicts.getState().byPageId).length === 0) return undefined;
  const entry = ctx.view.entryAt(path.split("/"));
  return entry === undefined || "caseOf" in entry ? undefined : entry.pageId;
}

/** Condition 23: reported under the PAGE's id (a `#meta` names its folder) with the file path. */
function reportConflict(step: Extract<InboundStep, { op: "conflict" }>): void {
  surface({ relPath: step.path, pageId: ownerOf(step.pageId), theirs: step.theirs, theirsHash: step.hash }, "changed on both sides");
}

function surface(conflict: Omit<IdeSyncConflict, "atMs">, why: string): void {
  useIdeSyncConflicts.getState().report({ ...conflict, atMs: Date.now() });
  ideOutput("sync", `CONFLICT: ${conflict.relPath} ${why} — open the file to resolve`);
}

export function failureLine(step: InboundStep, eventPath: string, reason: string): string {
  const unsynced = "the file stays in the sandbox, unsynced";
  if (step.op === "move") return `${eventPath}: not synced — moving ${step.fromPath} to ${step.toPath} failed (${reason}); ${unsynced}`;
  if (step.op === "restore") return `${eventPath}: not synced — the page could not be restored (${reason}); ${unsynced}`;
  if (step.op === "create") return `${eventPath}: no page created — ${reason}`;
  if (step.op === "apply") return `${eventPath}: not applied — ${reason}`;
  return `${eventPath}: ${step.op} failed — ${reason}`;
}

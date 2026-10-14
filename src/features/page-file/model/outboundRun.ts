/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   outboundRun.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import { sha16 } from "@/features/ide/model/ideFsEcho";
import { clearSyncedHash, moveSyncedDir, recordOutboundWrite, recordSyncedHash, syncedHashOf, takeShellArchived } from "@/features/ide/model/ideSyncEngine";
import type { Move, OutboundPlan } from "./outboundPlan";
import { kindOfPage } from "./pagePaths";
import { pageFileText } from "./pageFileText";
import { fileOfEntry } from "./pageIndex";

// Executes an OutboundPlan against an injectable io (production: the sandbox
// provider through the hook's wrapper, tests: an in-memory fake). One failure
// never aborts the run, and runOutbound itself never throws.

export type OutboundIo = {
  read(path: string): Promise<string | null>; // null when the path is absent or a directory
  write(path: string, content: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
};

export type OutboundHash = (content: string) => Promise<string>;

export type OutboundRunCtx = {
  workspaceId: string;
  plan: OutboundPlan;
  pathOf(id: string): string | undefined;
  pageById(id: string): PageEntry | undefined;
  io: OutboundIo;
  hash?: OutboundHash;
};

export type OutboundReport = {
  moved: string[];
  written: string[];
  skipped: { path: string; reason: string }[];
  removed: string[];
  kept: { path: string; reason: string }[];
  failed: { path: string; reason: string }[];
};

/** One run's observable state: report + hash + per-run page-text hash cache. O(1). */
export interface Run {
  report: OutboundReport;
  hash: OutboundHash;
  hashOf(page: PageEntry): Promise<string>;
}

function emptyReport(): OutboundReport {
  return { moved: [], written: [], skipped: [], removed: [], kept: [], failed: [] };
}

/** Build a Run: report accumulator + per-run text-hash WeakMap cache. O(1). */
export function makeRun(ctx: OutboundRunCtx): Run {
  const hash = ctx.hash ?? sha16;
  const textHash = new WeakMap<PageEntry, Promise<string>>();
  const report = emptyReport();
  const hashOf = (page: PageEntry): Promise<string> => {
    const cached = textHash.get(page);
    if (cached !== undefined) return cached;
    const computing = hash(pageFileText(page));
    textHash.set(page, computing);
    return computing;
  };
  return { report, hash, hashOf };
}

/** Apply a plan: moves first (so later FROM paths exist), then writes, then
 *  removes. Never throws — a phase-level failure lands in the report. O(n). */
export async function runOutbound(ctx: OutboundRunCtx): Promise<Run> {
  const run = makeRun(ctx);
  const agreedAtPlan = new Map(ctx.plan.removes.map((remove) => [remove.path, syncedHashOf(ctx.workspaceId, remove.path)]));
  try {
    await runMoves(ctx, run);
    await runWrites(ctx, run);
    await runRemoves(ctx, run, agreedAtPlan);
  } catch (error) {
    run.report.failed.push({ path: "plan", reason: messageOf(error) });
  }
  return run;
}

async function runMoves(ctx: OutboundRunCtx, run: Run): Promise<void> {
  for (const move of ctx.plan.moves) {
    try {
      await ctx.io.rename(move.from, move.to);
      followMoveLedger(ctx.workspaceId, move);
      run.report.moved.push(move.to);
    } catch (error) {
      const page = move.dir ? undefined : ctx.pageById(move.id);
      if (page === undefined || page.content === undefined) run.report.failed.push({ path: move.from, reason: messageOf(error) });
      else await writePageFile(ctx, run, page, move.to); // self-heal: the old file stays
    }
  }
}

/** The agreed hash follows a renamed file; a renamed DIR (folder page or a page's children
 *  dir) carries every agreement under it, `_folder.omd` included. */
function followMoveLedger(workspaceId: string, move: Move): void {
  if (move.dir) {
    moveSyncedDir(workspaceId, move.from, move.to);
    return;
  }
  const agreed = syncedHashOf(workspaceId, move.from);
  if (agreed === null) return;
  recordSyncedHash(workspaceId, move.to, agreed);
  clearSyncedHash(workspaceId, move.from);
}

async function runWrites(ctx: OutboundRunCtx, run: Run): Promise<void> {
  for (const id of ctx.plan.changed) {
    const page = ctx.pageById(id);
    if (!page) { run.report.skipped.push({ path: id, reason: "page no longer live" }); continue; }
    const kind = kindOfPage(page);
    if (kind === "code") continue;
    const own = ctx.pathOf(id);
    if (own === undefined) { run.report.skipped.push({ path: id, reason: "not in the index" }); continue; }
    await writePageFile(ctx, run, page, fileOfEntry({ path: own, kind }));
  }
}

/**
 * Write a page's text at `target` unless the shell owns what is there. Overwritten only when
 * absent or still the last agreed content: a file the shell changed since the last sync is
 * KEPT (the inbound side surfaces it as a conflict), never replaced — the same rule as removes.
 * One read + one hash per write that is not already synced.
 * Ponytail: read-then-write is not atomic — a shell write landing between the two is
 * overwritten here, and its fs event then re-applies it inbound (the shell wins that ms race).
 */
async function writePageFile(ctx: OutboundRunCtx, run: Run, page: PageEntry, target: string): Promise<void> {
  const { workspaceId, io } = ctx;
  try {
    const hash = await run.hashOf(page);
    if (hash === syncedHashOf(workspaceId, target)) { run.report.skipped.push({ path: target, reason: "already synced" }); return; }
    const current = await io.read(target);
    const currentHash = current === null ? null : await run.hash(current);
    if (currentHash === hash) {
      recordSyncedHash(workspaceId, target, hash);
      run.report.skipped.push({ path: target, reason: "already synced" });
      return;
    }
    if (currentHash !== null && currentHash !== syncedHashOf(workspaceId, target)) {
      run.report.kept.push({ path: target, reason: "changed in the shell since the last sync" });
      return;
    }
    const undo = recordOutboundWrite(workspaceId, target, hash);
    try {
      await io.write(target, pageFileText(page));
    } catch (error) {
      undo();
      throw error;
    }
    run.report.written.push(target);
  } catch (error) {
    run.report.failed.push({ path: target, reason: messageOf(error) });
  }
}

/** A file is removed only when it still holds what was agreed when the plan was made,
 *  read before any await: the inbound side records the agreement of a file it just made
 *  a NEW page from, at the same path, and a remove reading that one deleted the file.
 *  A page the shell deleted is never removed here (takeShellArchived), and the agreement
 *  cleared is only ever the planned one, never a new page's recorded meanwhile. */
async function runRemoves(ctx: OutboundRunCtx, run: Run, agreedAtPlan: ReadonlyMap<string, string | null>): Promise<void> {
  const forgetPlanned = (path: string): void => {
    if (syncedHashOf(ctx.workspaceId, path) === agreedAtPlan.get(path)) clearSyncedHash(ctx.workspaceId, path);
  };
  for (const remove of ctx.plan.removes) {
    if (takeShellArchived(ctx.workspaceId, remove.id)) {
      run.report.skipped.push({ path: remove.path, reason: "deleted in the shell" });
      continue;
    }
    const page = ctx.pageById(remove.id);
    if (page && kindOfPage(page) === "dir") continue; // never delete a folder
    let current: string | null;
    try {
      current = await ctx.io.read(remove.path);
    } catch (error) {
      run.report.failed.push({ path: remove.path, reason: messageOf(error) });
      continue;
    }
    if (current === null) { forgetPlanned(remove.path); continue; }
    try {
      const hash = await run.hash(current);
      if (hash !== agreedAtPlan.get(remove.path)) {
        run.report.kept.push({ path: remove.path, reason: "changed in the shell since the last sync" });
        continue;
      }
      await ctx.io.remove(remove.path);
      forgetPlanned(remove.path);
      run.report.removed.push(remove.path);
    } catch (error) {
      run.report.failed.push({ path: remove.path, reason: messageOf(error) });
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundPlanWrite.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The WRITE rows of the inbound table (R1-R8). Names, echo and front matter are
// gates rather than rows: a path the app could never own, our own write coming
// back, and a file whose front matter did not parse stop before the table.

import { splitFrontMatter } from "@/features/page-file/model/frontMatter";
import { isFolderMetaName, isPageFileName } from "@/features/page-file/model/pageFileCodec";
import { copyOf, decide, noFolderSkip, relocate, skipLoud } from "./inboundPlanMove";
import { inboundSegments, isEditorTempName } from "./inboundNames";

import type { InboundStep, InboundView, InboundWriteEvent, ViewEntry } from "./inboundPlan";
import type { SplitFrontMatter } from "@/features/page-file/model/frontMatter";
import type { WriteContext } from "./inboundPlanMove";

type EntryMatch = ReturnType<InboundView["entryAt"]>;

/** R1/R9 (A5): an editor's scratch file — quiet only when no page owns that exact
 *  path (a case-only match is not "no page", so it stays loud too). */
export function tempSkip(path: string, entry: EntryMatch): InboundStep {
  return { op: "skip", reason: `${path} looks like an editor temp file; not synced`, quiet: entry === undefined };
}

/**
 * R1-R8 in binding order: names and temp names (R1), echo (R2), front matter
 * (A4), then where the path lands — another letter case (R3), a directory (R4),
 * a page's own file (R5) or nobody's (R6-R8). O(len(path) + len(text)): one
 * split, one entryAt, one front-matter parse, and one sha16 when a row decides.
 */
export async function planInboundWrite(event: InboundWriteEvent, view: InboundView): Promise<InboundStep[]> {
  const ctx: WriteContext = { path: event.path, text: event.text, hash: event.hash, view };
  const named = inboundSegments(event.path);
  if ("skip" in named) return [skipLoud(named.skip)];
  const name = named.segments[named.segments.length - 1];
  const entry = view.entryAt(named.segments);
  if (isEditorTempName(name)) return [tempSkip(ctx.path, entry)];
  const echo = echoRow(entry, ctx);
  if (echo !== null) return echo;
  const fm = isPageFileName(name) ? splitFrontMatter(event.text) : null;
  if (fm !== null && fm.error !== null) return [skipLoud(`${ctx.path}: front matter not read: ${fm.error}`)];
  const fid = pageIdOf(fm);
  if (entry === undefined) return unclaimedRow(name, fid, ctx);
  if ("caseOf" in entry) return caseOnlyRow(fid, entry.caseOf, fm !== null, ctx);
  if (entry.role === "children-dir" || entry.role === "folder-dir") return [skipLoud(`${ctx.path}: a directory, not a file`)];
  return ownedFileRow(entry.pageId, fid, ctx);
}

/**
 * R2. Our own write bouncing back: record it and drop the archive its delete
 * half queued. The LEDGER test is what keeps a rename from looking like an echo:
 * after the app wrote A.omd, `mv A.omd B.omd` writes B.omd with a hash the
 * ledger only holds at A.omd. O(1).
 */
function echoRow(entry: EntryMatch, ctx: WriteContext): InboundStep[] | null {
  if (!ctx.view.isEchoHash(ctx.hash) || ctx.view.syncedHashOf(ctx.path) !== ctx.hash) return null;
  const owner = entry !== undefined && !("caseOf" in entry) ? entry.pageId : undefined;
  const steps: InboundStep[] = owner !== undefined && ctx.view.hasOwnPending(owner) ? [{ op: "cancel-archive", pageId: owner }] : [];
  steps.push({ op: "record", path: ctx.path, hash: ctx.hash });
  return steps;
}

/** R6-R8: a write onto a name no page owns — a page file, a folder meta, or code. */
async function unclaimedRow(name: string, fid: string | undefined, ctx: WriteContext): Promise<InboundStep[]> {
  if (!isPageFileName(name)) return codeFileRow(ctx);
  return isFolderMetaName(name) ? folderMetaRow(fid, ctx) : pageFileRow(fid, ctx);
}

/**
 * R8 + R6b for code (Q2). A code file has no id, so `X/rel` is code page Q moved
 * only when a pending deleted directory D holds Q at `D/rel` and the ledger's hash
 * there equals the event's — then Q relocates like a page file; else a new page.
 * The longest `rel` is tried first, so `X/util/a.ts` is `D/util/a.ts`, not a
 * same-text `E/a.ts`. O(depth² × pending dirs) map lookups.
 * Ponytail: a code file edited inside the move window (hash differs from the
 * ledger) is created as a new page, and the original archives with its old
 * directory — a duplicate plus a trash entry, never a loss.
 */
async function codeFileRow(ctx: WriteContext): Promise<InboundStep[]> {
  const segments = ctx.path.split("/");
  for (let cut = 1; cut < segments.length; cut += 1) {
    const rel = segments.slice(cut);
    for (const deleted of ctx.view.pendingDeletedDirs()) {
      const moved = movedCodePage([...deleted.dir.split("/"), ...rel], ctx);
      const evidence = moved === undefined ? undefined : ctx.view.moveEvidence(moved);
      if (moved !== undefined && evidence !== undefined) return relocate(moved, evidence, ctx);
    }
  }
  return [copyOf(ctx)];
}

/** The live code page whose file sits exactly at `segments` with the event's hash agreed there. O(depth). */
function movedCodePage(segments: readonly string[], ctx: WriteContext): string | undefined {
  const entry = ctx.view.entryAt(segments);
  if (entry === undefined || "caseOf" in entry || entry.role !== "code-file") return undefined;
  return ctx.view.syncedHashOf(segments.join("/")) === ctx.hash ? entry.pageId : undefined;
}

/**
 * R3 (A3). `mv readme.omd README.omd` on a case-sensitive disk: the path matches
 * page E only case-insensitively. Only E's own id AND E's pending archive prove
 * a rename — otherwise it is a second file that merely looks alike. O(1).
 */
async function caseOnlyRow(fid: string | undefined, entry: ViewEntry, isPageFile: boolean, ctx: WriteContext): Promise<InboundStep[]> {
  if (isPageFile && fid === entry.pageId && ctx.view.hasOwnPending(entry.pageId)) {
    return relocate(entry.pageId, { kind: "own" }, ctx);
  }
  return [skipLoud(`${ctx.path}: differs only in letter case from an existing file`)];
}

/** R7: only a live FOLDER's id in a `_folder.omd`, with move evidence, moves it. O(depth). */
async function folderMetaRow(fid: string | undefined, ctx: WriteContext): Promise<InboundStep[]> {
  const state = fid === undefined ? undefined : ctx.view.pageState(fid);
  const evidence = fid !== undefined && state?.status === "live" && state.isFolder ? ctx.view.moveEvidence(fid) : undefined;
  return fid !== undefined && evidence !== undefined ? relocate(fid, evidence, ctx) : [noFolderSkip(ctx.path)];
}

/**
 * R6. The page a bare `.omd` names: a move when the view proves one, a restore
 * when THIS flow archived it, a copy otherwise — an unknown id (another
 * workspace), a page trashed in the UI, a live page with no evidence (`cp`),
 * and a folder's id (a `_folder.omd` copied to a page name: moving the folder
 * onto that file's directory would be wrong). O(depth) plus one sha16.
 */
async function pageFileRow(fid: string | undefined, ctx: WriteContext): Promise<InboundStep[]> {
  const state = fid === undefined ? undefined : ctx.view.pageState(fid);
  if (fid === undefined || state === undefined) return [copyOf(ctx)];
  if (state.status === "live") {
    const evidence = state.isFolder ? undefined : ctx.view.moveEvidence(fid);
    return evidence === undefined ? [copyOf(ctx)] : relocate(fid, evidence, ctx);
  }
  const archive = ctx.view.archivedByInbound(fid);
  if (archive === undefined || !ctx.view.canDelete(fid)) return [copyOf(ctx)];
  const steps: InboundStep[] = [
    { op: "restore", pageId: fid },
    { op: "move", pageId: fid, fromPath: archive.path, toPath: ctx.path, dir: false },
  ];
  steps.push(...(await decide(fid, archive.syncedHash, ctx)));
  return steps;
}

/**
 * R5. The path is page P's own file. An id naming another page Q is a `cp` or
 * `mv` over P: Q's pending archive is dropped (its id lives on in this file) and
 * the clash is surfaced as a conflict on P — never Q's body or title applied
 * onto P. O(1) plus one sha16 when the row decides.
 */
async function ownedFileRow(pageId: string, fid: string | undefined, ctx: WriteContext): Promise<InboundStep[]> {
  const steps: InboundStep[] = [];
  if (ctx.view.hasOwnPending(pageId)) steps.push({ op: "cancel-archive", pageId });
  if (fid !== undefined && fid !== pageId) {
    if (ctx.view.hasOwnPending(fid)) steps.push({ op: "cancel-archive", pageId: fid });
    steps.push({ op: "conflict", pageId, path: ctx.path, theirs: ctx.text, hash: ctx.hash });
    return steps;
  }
  steps.push(...(await decide(pageId, ctx.view.syncedHashOf(ctx.path), ctx, ctx.view.agreedPageHash(ctx.path, ctx.hash))));
  return steps;
}

/** `fid`: the meta id, counted only when it is a non-empty string. O(1). */
function pageIdOf(fm: SplitFrontMatter | null): string | undefined {
  const id = fm?.meta.id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

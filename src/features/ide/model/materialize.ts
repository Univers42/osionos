/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   materialize.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Attach (the fs-agent's "ready"): a three-way reconcile of the readable page
// tree against the sandbox volume and the sync ledger (reconcileOnAttach), so a
// shell edit made while the app was away is applied, not overwritten. It runs
// INSIDE the queued ready task, so a shell edit goes through the session's
// `run`, never the queue (D1: the queue would wait on this very task). No live
// imports: node runs it against an in-memory sandbox.

import type { PageEntry } from "@/entities/page";
import { fileOfEntry } from "@/features/page-file/model/pageIndex";
import { pageFileText } from "@/features/page-file/model/pageFileText";
import { sha16 } from "./ideFsEcho";
import { ideOutput } from "./ideOutputBus";
import { useIdeSyncConflicts } from "./ideSyncConflicts";
import {
  reconcileOnAttach, MAX_ATTACH_FILES, ATTACH_FILE_CAP_REASON, type DesiredFile, type ReconcileReport,
} from "./reconcileOnAttach";

import type { ReadableViews } from "@/features/page-file/model/pageFileFacadeViews";
import type { FsProvider } from "../vfs/types";
import type { InboundSession } from "./inboundSession";

export interface AttachDeps {
  workspaceId: string;
  session: Pick<InboundSession, "views" | "run">;
  provider: FsProvider;
}

/** `unloaded`: pages skipped because their body never loaded; `failed`: every other skip. */
export type MaterializeResult = { written: number; unloaded: number; failed: number; report: ReconcileReport };

/** A desired file and the page object it was read from — what 14' and 15 compare against. */
type Snapshot = DesiredFile & { pageId: string; indexPath: string; page: PageEntry };
type Skipped = ReconcileReport["skipped"];

const NOT_LOADED = "page content not loaded, not reconciled";
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * 16: every index entry as `{ path, content: pageFileText(page) }`, a folder as
 * its `_folder.omd` (no body needed). Only the first MAX_ATTACH_FILES loaded
 * files are serialized. O(n) plus the text of at most MAX_ATTACH_FILES pages.
 * Ponytail: a page or code page whose body never loaded is skipped — its stand-in
 * would overwrite the sandbox copy — so a shell edit made to it while away waits
 * until the page is opened or edited (the outbound writer), never applied here.
 */
function desiredSet(views: ReadableViews): { files: Snapshot[]; skipped: Skipped } {
  const files: Snapshot[] = [];
  const skipped: Skipped = [];
  for (const entry of views.indexOf().entries) {
    const page = views.pageById(entry.id);
    const path = fileOfEntry(entry);
    if (page === undefined) continue;
    if (entry.kind !== "dir" && page.content === undefined) skipped.push({ path, reason: NOT_LOADED });
    else if (files.length >= MAX_ATTACH_FILES) skipped.push({ path, reason: ATTACH_FILE_CAP_REASON });
    else files.push({ path, content: pageFileText(page), pageId: entry.id, indexPath: entry.path, page });
  }
  return { files, skipped };
}

/**
 * 15: a page the app changed while attach ran may have had its newer file
 * overwritten with the snapshot's text, so each written path whose page object
 * changed — and still lives there — is reconciled once more with the current
 * text (the ledger holds what attach wrote, so the re-run writes). A page renamed
 * meanwhile is the outbound writer's move. O(written).
 * Ponytail: once — a page changed AGAIN while the re-run writes can still end
 * older in the sandbox, until its next edit or the next attach.
 */
async function rewriteChanged(deps: AttachDeps, byPath: ReadonlyMap<string, Snapshot>, report: ReconcileReport): Promise<void> {
  const { views } = deps.session;
  const changed: DesiredFile[] = [];
  for (const path of report.written) {
    const was = byPath.get(path);
    const page = was === undefined ? undefined : views.pageById(was.pageId);
    if (was === undefined || page === undefined || page === was.page) continue;
    if (views.indexOf().pathForId(was.pageId) === was.indexPath) changed.push({ path, content: pageFileText(page) });
  }
  if (changed.length === 0) return;
  const again = await reconcileOnAttach({ workspaceId: deps.workspaceId, desired: changed, provider: deps.provider });
  report.inbound.push(...again.inbound);
  report.conflicts.push(...again.conflicts);
  report.skipped.push(...again.skipped);
}

/** Hand the sandbox side to the conflict banner (keep mine / take sandbox). */
async function surfaceConflict(input: { path: string; theirs: string; pageId: string; why: string }): Promise<void> {
  useIdeSyncConflicts.getState().report({
    relPath: input.path, pageId: input.pageId, theirs: input.theirs,
    theirsHash: await sha16(input.theirs), atMs: Date.now(),
  });
  ideOutput("sync", `CONFLICT: ${input.path} ${input.why} — open the file to resolve`);
}

/**
 * 14': a shell edit made while the app was away, planned and executed by the
 * session — the executor records the ledger when it applies. Refused when the
 * page object changed since the snapshot (the app moved on: applying could undo
 * its edit or rename) or when the executor did not apply it; either way the
 * sandbox side goes to the conflict store and the old agreement stands. An
 * outcome the executor already reported is not reported again (C3b5 C4.1, P5).
 */
async function settleInbound(deps: AttachDeps, file: { path: string; content: string }, was: Snapshot): Promise<void> {
  try {
    if (deps.session.views.pageById(was.pageId) !== was.page) throw new Error("the page changed during attach");
    const outcome = await deps.session.run({ kind: "write", path: file.path, text: file.content, hash: await sha16(file.content) });
    if (!outcome.applied && !outcome.reported) throw new Error(outcome.error ?? "the executor did not apply it");
  } catch (error) {
    const why = `changed in the sandbox but could not be applied (${messageOf(error)})`;
    await surfaceConflict({ path: file.path, theirs: file.content, pageId: was.pageId, why });
  }
}

/**
 * Reconcile the page tree into the sandbox (file header). Sandbox-only files are
 * left alone; shell edits made while away are applied through the session;
 * both-sides changes go to the conflict store; caps and failures surface in
 * `failed` / `report.skipped`. O(n) plus O(B) over the reconciled files.
 */
export async function attachWorkspace(deps: AttachDeps): Promise<MaterializeResult> {
  const { files, skipped } = desiredSet(deps.session.views);
  const byPath = new Map(files.map((file) => [file.path, file]));
  const report = await reconcileOnAttach({
    workspaceId: deps.workspaceId, desired: files, provider: deps.provider,
    // No ledger + a loaded, empty page: the sandbox copy wins — decideInboundWrite's live rule.
    tiebreak: (path) => (byPath.get(path)?.content === "" ? "theirs" : null),
  });
  await rewriteChanged(deps, byPath, report);
  report.skipped.push(...skipped);
  for (const file of report.inbound) {
    const was = byPath.get(file.path);
    if (was !== undefined) await settleInbound(deps, file, was);
  }
  for (const { path, theirs } of report.conflicts) {
    const was = byPath.get(path);
    if (was !== undefined) await surfaceConflict({ path, theirs, pageId: was.pageId, why: "changed on both sides" });
  }
  const unloaded = skipped.filter((skip) => skip.reason === NOT_LOADED).length;
  return { written: report.written.length, unloaded, failed: report.skipped.length - unloaded, report };
}

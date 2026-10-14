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
import { withoutLegacyUpdated } from "@/features/page-file/model/frontMatter";
import { fileOfEntry } from "@/features/page-file/model/pageIndex";
import { pageFileText } from "@/features/page-file/model/pageFileText";
import { sha16 } from "./ideFsEcho";
import { ideOutput } from "./ideOutputBus";
import { useIdeSyncConflicts } from "./ideSyncConflicts";
import { syncedHashOf } from "./ideSyncEngine";
import {
  reconcileOnAttach, MAX_ATTACH_FILE_BYTES, OVERSIZE_REASON, type DesiredFile, type ReconcileOptions, type ReconcileReport,
} from "./reconcileOnAttach";

import type { ReadableViews } from "@/features/page-file/model/pageFileFacadeViews";
import type { FsProvider } from "../vfs/types";
import type { InboundSession } from "./inboundSession";

export interface AttachDeps {
  workspaceId: string;
  session: Pick<InboundSession, "views" | "run">;
  provider: FsProvider;
  /** One call for every path's sandbox hash (reconcileOnAttach's theirsHashes). */
  theirsHashes?: ReconcileOptions["theirsHashes"];
}

/**
 * Every skip counted once, under what it is: `unloaded`, a never-synced page whose body did not
 * load (past BODY_FETCHES_PER_ATTACH, or its fetch failed); `known`, a page synced before whose
 * body is not loaded, so not re-checked; `oversize`, over the byte cap; `failed`, anything else.
 */
export type MaterializeResult = {
  written: number; unloaded: number; known: number; oversize: number; failed: number; report: ReconcileReport;
};

/** A desired file and the page object it was read from — what 14' and 15 compare against. */
type Snapshot = DesiredFile & { pageId: string; indexPath: string; page: PageEntry };
type Skipped = ReconcileReport["skipped"];

const NOT_LOADED = "page content not loaded, not reconciled";
const KNOWN_UNLOADED = "synced before, content not loaded, not re-checked";
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * 16: every index entry as `{ path, content: pageFileText(page) }`, a folder as
 * its `_folder.omd` (no body needed). O(n) plus the text of every loaded page,
 * held until the attach ends (reconcileOnAttach pages through it).
 * Ponytail: a page or code page whose body never loaded is skipped — its stand-in
 * would overwrite the sandbox copy — so a shell edit made to it while away waits
 * until the page is opened or edited (the outbound writer), never applied here.
 */
function desiredSet(views: ReadableViews, isSynced: (path: string) => boolean): { files: Snapshot[]; skipped: Skipped } {
  const files: Snapshot[] = [];
  const skipped: Skipped = [];
  for (const entry of views.indexOf().entries) {
    const page = views.pageById(entry.id);
    const path = fileOfEntry(entry);
    if (page === undefined) continue;
    if (entry.kind !== "dir" && page.content === undefined) skipped.push({ path, reason: isSynced(path) ? KNOWN_UNLOADED : NOT_LOADED });
    else files.push({ path, content: pageFileText(page), pageId: entry.id, indexPath: entry.path, page });
  }
  return { files, skipped };
}

const BODY_FETCH_CONCURRENCY = 6;
/** Bodies one attach fetches at most; the Output line names the rest as not loaded. */
export const BODY_FETCHES_PER_ATTACH = 500;

/**
 * Fetches the bodies attach would skip as not loaded, a few at a time, and returns how many it
 * asked for. A fresh tab has loaded the open page alone: "materialized 0 files, 31 not loaded
 * yet", and the explorer, which lists the sandbox once it is online, showed 2 of 31 pages
 * (2026-10-14). A fetch that fails leaves its page unloaded; attach still skips and counts it.
 * A path this browser already synced is skipped (`isSynced`): the volume outlives the box, so
 * a page reaches it once, and a reload of a 700-page workspace no longer costs 500 fetches.
 * Caveat: one request per page, and the live fetcher rewrites the whole pages cache each time,
 * so a first attach grows with the square of the page count; bounded by BODY_FETCHES_PER_ATTACH,
 * and a workspace near that bound wants a batch endpoint. Past it, a fresh browser reconciles the
 * next never-synced pages at the next attach; a page left in conflict stays never-synced and is
 * fetched again first, so 500 of them would hold the rest back. A page changed on another device
 * after this browser last synced it keeps the sandbox copy until it is opened here (attach's own rule).
 */
export async function loadUnloadedBodies(
  views: ReadableViews,
  fetchBody: (pageId: string) => Promise<void>,
  isSynced: (path: string) => boolean = () => false,
): Promise<number> {
  const ids = views.indexOf().entries
    .filter((entry) => entry.kind !== "dir" && views.pageById(entry.id)?.content === undefined && !isSynced(fileOfEntry(entry)))
    .slice(0, BODY_FETCHES_PER_ATTACH)
    .map((entry) => entry.id);
  for (let i = 0; i < ids.length; i += BODY_FETCH_CONCURRENCY) {
    await Promise.all(ids.slice(i, i + BODY_FETCH_CONCURRENCY).map((id) => fetchBody(id).catch(() => undefined)));
  }
  return ids.length;
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
 * both-sides changes go to the conflict store; every skip is in `report.skipped`
 * and counted by kind (MaterializeResult). O(n) plus O(B) over the reconciled files.
 */
export async function attachWorkspace(deps: AttachDeps): Promise<MaterializeResult> {
  const { files, skipped } = desiredSet(deps.session.views, (path) => syncedHashOf(deps.workspaceId, path) !== null);
  const byPath = new Map(files.map((file) => [file.path, file]));
  const report = await reconcileOnAttach({
    workspaceId: deps.workspaceId, desired: files, provider: deps.provider, theirsHashes: deps.theirsHashes,
    // No ledger + a loaded, empty page: the sandbox copy wins — decideInboundWrite's live rule.
    // A copy that differs only by a legacy `updated:` line is this page: ours, in today's form.
    tiebreak: (path, theirs) => {
      const ours = byPath.get(path)?.content;
      if (ours === "") return "theirs";
      return ours !== undefined && withoutLegacyUpdated(theirs) === ours ? "ours" : null;
    },
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
  const count = (matches: (reason: string) => boolean): number => report.skipped.filter((skip) => matches(skip.reason)).length;
  const unloaded = count((reason) => reason === NOT_LOADED);
  const known = count((reason) => reason === KNOWN_UNLOADED);
  const oversize = count((reason) => reason.endsWith(OVERSIZE_REASON));
  const failed = report.skipped.length - unloaded - known - oversize;
  return { written: report.written.length, unloaded, known, oversize, failed, report };
}

/** The attach's Output line: a skip that is a cap or a page not loaded is never called FAILED. */
export function attachSummary({ written, unloaded, known, oversize, failed }: Omit<MaterializeResult, "report">): string {
  const parts = [
    unloaded > 0 ? `${unloaded} not loaded (cap ${BODY_FETCHES_PER_ATTACH} per attach)` : "",
    known > 0 ? `${known} synced before, not re-checked` : "",
    oversize > 0 ? `${oversize} over ${MAX_ATTACH_FILE_BYTES / 1024} KiB, not synced` : "",
    failed > 0 ? `${failed} FAILED` : "",
  ];
  return `sandbox attached — materialized ${written} files${parts.filter(Boolean).map((part) => `, ${part}`).join("")}`;
}

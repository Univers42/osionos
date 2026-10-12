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

import type { PageEntry } from "@/entities/page";
import { buildVPath, joinV, type VPath } from "../vfs/vpath";
import { createPageProvider, resolveFacadePath, type PageFacade } from "../vfs/pageProvider";
import { createSandboxProvider } from "../vfs/sandboxProvider";
import { bridgeFsTransport } from "../vfs/bridgeTransport";
import { pageStoreFacade } from "./pageStoreFacade";
import { sha16 } from "./ideFsEcho";
import { recordSyncedHash } from "./ideSyncEngine";
import { useIdeSyncConflicts } from "./ideSyncConflicts";
import { ideOutput } from "./ideOutputBus";
import {
  reconcileOnAttach, emptyReconcileReport, MAX_ATTACH_FILES, ATTACH_FILE_CAP_REASON,
  type DesiredFile, type ReconcileReport,
} from "./reconcileOnAttach";

export type InboundFile = { path: string; content: string };

export type MaterializeOptions = {
  /** Applies a sandbox edit made while the app was away to its page; the ledger
   *  records the agreement once it resolves. Absent: the file is surfaced
   *  through the conflict reporter, so neither side changes until the user picks. */
  onInbound?: (file: InboundFile) => Promise<void>;
};

export type MaterializeResult = { written: number; failed: number; report: ReconcileReport };

type PageFile = { path: string; pageId: string };
type Skipped = ReconcileReport["skipped"];

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Every file the osionos:// mount serves (its title-collision rule included), with its page id. */
async function listPageFiles(facade: PageFacade, workspaceId: string): Promise<PageFile[]> {
  const pages = createPageProvider("osionos", facade);
  const files: PageFile[] = [];
  const walk = async (dir: VPath): Promise<void> => {
    for (const entry of await pages.list(dir)) {
      const child = joinV(dir, entry.name);
      if (entry.kind === "dir") await walk(child);
      const page = entry.kind === "file" ? resolveFacadePath(facade, child.segments) : undefined;
      if (page) files.push({ path: child.segments.join("/"), pageId: page.id });
    }
  };
  await walk(buildVPath("osionos", workspaceId, []));
  return files;
}

/** Content of the first MAX_ATTACH_FILES pages; the rest are reported, never loaded.
 *  A lazy page whose fetch failed reads as "" — indistinguishable from an empty
 *  page — so it is skipped: that stand-in must never overwrite the sandbox copy.
 *  Ponytail: "loaded" means the facade reports a size; a code page with no code
 *  block never does, so it is skipped on every attach (reported, never written). */
async function loadDesired(facade: PageFacade, files: PageFile[]): Promise<{ desired: DesiredFile[]; skipped: Skipped }> {
  const skipped: Skipped = files.slice(MAX_ATTACH_FILES).map((file) => ({ path: file.path, reason: ATTACH_FILE_CAP_REASON }));
  const contents = new Map<string, string>();
  for (const file of files.slice(0, MAX_ATTACH_FILES)) {
    try {
      contents.set(file.pageId, await facade.readContent(file.pageId));
    } catch (error) {
      skipped.push({ path: file.path, reason: `page content did not load: ${messageOf(error)}` });
    }
  }
  const loaded = new Set(facade.list().filter((entry) => entry.sizeBytes !== null).map((entry) => entry.id));
  const desired: DesiredFile[] = [];
  for (const file of files.slice(0, MAX_ATTACH_FILES)) {
    const content = contents.get(file.pageId);
    if (content === undefined) continue;
    if (loaded.has(file.pageId)) desired.push({ path: file.path, content });
    else skipped.push({ path: file.path, reason: "page content not loaded, not reconciled" });
  }
  return { desired, skipped };
}

/** Hand the sandbox side to the existing conflict banner (keep mine / take sandbox). */
async function surfaceConflict(input: { path: string; theirs: string; pageId: string | undefined; why: string }): Promise<void> {
  if (!input.pageId) return;
  useIdeSyncConflicts.getState().report({
    relPath: input.path, pageId: input.pageId, theirs: input.theirs,
    theirsHash: await sha16(input.theirs), atMs: Date.now(),
  });
  ideOutput("sync", `CONFLICT: ${input.path} ${input.why} — open the file to resolve`);
}

async function settleInbound(workspaceId: string, inbound: InboundFile[], pageIds: Map<string, string>, onInbound?: MaterializeOptions["onInbound"]): Promise<void> {
  for (const file of inbound) {
    const conflict = { path: file.path, theirs: file.content, pageId: pageIds.get(file.path) };
    if (!onInbound) {
      await surfaceConflict({ ...conflict, why: "changed in the sandbox while the app was away" });
      continue;
    }
    try {
      await onInbound(file);
      recordSyncedHash(workspaceId, file.path, await sha16(file.content));
    } catch (error) {
      await surfaceConflict({ ...conflict, why: `changed in the sandbox but could not be applied (${messageOf(error)})` });
    }
  }
}

/**
 * Reconcile the canonical page tree with the sandbox volume on attach (P4):
 * a three-way merge against the persisted sync ledger (reconcileOnAttach), so
 * shell edits made while the app was closed survive instead of being
 * overwritten. Writes record echo hashes, so the fs-agent's re-emission never
 * loops back into the page store. Sandbox-only files are left alone. Caps,
 * unloaded pages and failures surface in `failed` / `report.skipped`.
 */
export async function materializeWorkspace(
  workspaceId: string,
  _pages: PageEntry[],
  options: MaterializeOptions = {},
): Promise<MaterializeResult> {
  if (!workspaceId) return { written: 0, failed: 0, report: emptyReconcileReport() };
  const facade = pageStoreFacade(workspaceId);
  const files = await listPageFiles(facade, workspaceId);
  const { desired, skipped } = await loadDesired(facade, files);
  const emptyPages = new Set(desired.filter((file) => file.content === "").map((file) => file.path));
  const report = await reconcileOnAttach({
    workspaceId,
    desired,
    provider: createSandboxProvider("sandbox", bridgeFsTransport(workspaceId)),
    // No ledger + an empty page: the sandbox copy wins — decideInboundWrite's live rule.
    tiebreak: (path) => (emptyPages.has(path) ? "theirs" : null),
  });
  report.skipped.push(...skipped);
  const pageIds = new Map(files.map((file) => [file.path, file.pageId]));
  await settleInbound(workspaceId, report.inbound, pageIds, options.onInbound);
  for (const conflict of report.conflicts) {
    await surfaceConflict({ path: conflict.path, theirs: conflict.theirs, pageId: pageIds.get(conflict.path), why: "changed on both sides" });
  }
  return { written: report.written.length, failed: report.skipped.length, report };
}

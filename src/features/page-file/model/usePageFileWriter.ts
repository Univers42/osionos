/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePageFileWriter.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";

import type { PageEntry } from "@/entities/page";
import { ideOutput } from "@/features/ide/model/ideOutputBus";
import { isSandboxOnline, useSandboxHealthStore } from "@/features/ide/model/sandboxHealthStore";
import { bytesToText, collectBytes, textToBytes } from "@/features/ide/vfs/bytes";
import { bridgeFsTransport } from "@/features/ide/vfs/bridgeTransport";
import { isFsError } from "@/features/ide/vfs/errors";
import { createSandboxProvider } from "@/features/ide/vfs/sandboxProvider";
import type { FsProvider } from "@/features/ide/vfs/types";
import { buildVPath, parentV, type VPath } from "@/features/ide/vfs/vpath";
import { clearAppRemovals, forgetLiveAppRemovals, takeAppRemoval } from "@/store/appRemovals";
import { usePageStore } from "@/store/usePageStore";

import { pageIndexFor } from "./pageIndexCache";
import { planOutbound, type Snapshot } from "./outboundPlan";
import { LEFT_WITHOUT_PAGE, runOutbound, type OutboundIo, type OutboundReport } from "./outboundRun";

/** Trailing edge: a run is scheduled 800 ms after the last page-store change. */
export const WRITE_DEBOUNCE_MS = 800;

/** Wrap the sandbox provider in the OutboundIo the runner expects: reads are
 *  null on absent/dir paths, and writes/renames create missing parents and
 *  retry once (a rename into a fresh folder must mkdir its target first). */
function sandboxIo(provider: FsProvider, authority: string): OutboundIo {
  const at = (path: string): VPath => buildVPath("sandbox", authority, path.split("/"));
  return {
    async read(path) {
      try {
        const bytes = await collectBytes(await provider.read(at(path)));
        return bytesToText(bytes);
      } catch (error) {
        if (isFsError(error) && (error.code === "NotFound" || error.code === "IsADirectory")) return null;
        throw error;
      }
    },
    async write(path, content) {
      await retryWithParents(provider, at(path), (p, v) => p.write(v, textToBytes(content)));
    },
    async rename(from, to) {
      await retryWithParents(provider, at(to), (p, v) => p.rename(at(from), v));
    },
    async remove(path) {
      await provider.delete(at(path));
    },
  };
}

/** One retry after creating the missing parents under `path`. */
async function retryWithParents(
  provider: FsProvider,
  path: VPath,
  op: (p: FsProvider, v: VPath) => Promise<void>,
): Promise<void> {
  try {
    await op(provider, path);
  } catch (error) {
    if (!isFsError(error) || error.code !== "NotFound") throw error;
    await ensureDir(provider, parentV(path));
    await op(provider, path);
  }
}

/** Create every missing ancestor of `dir`, shallowest first; a racing
 *  creation is fine (AlreadyExists is swallowed). O(depth) stats + mkdirs. */
async function ensureDir(provider: FsProvider, dir: VPath | null): Promise<void> {
  const missing: VPath[] = [];
  let current: VPath | null = dir;
  for (;;) {
    if (!current || current.segments.length === 0) break;
    const exists = await provider.stat(current).then(() => true, () => false);
    if (exists) break;
    missing.push(current);
    current = parentV(current);
  }
  for (let i = missing.length - 1; i >= 0; i--) {
    await provider.mkdir(missing[i]).catch((error) => {
      if (!isFsError(error) || error.code !== "AlreadyExists") throw error;
    });
  }
}

/** One OUTPUT line with the counts, then a line per kept/failed path. */
function summarize(workspaceId: string, report: OutboundReport): void {
  const { moved, written, skipped, removed, kept, failed } = report;
  const left = skipped.filter((item) => item.reason === LEFT_WITHOUT_PAGE).length;
  const total = moved.length + written.length + skipped.length + removed.length + kept.length + failed.length;
  if (total === 0) return;
  ideOutput(
    "fs-sync",
    `page files: ${written.length} written, ${moved.length} moved, ${removed.length} removed` +
      `${kept.length ? `, ${kept.length} kept` : ""}${left ? `, ${left} left without a page` : ""}` +
      `${failed.length ? `, ${failed.length} FAILED` : ""}`,
  );
  for (const item of [...kept, ...failed]) ideOutput("fs-sync", `${item.reason}: ${item.path}`);
}

/**
 * Page → `.omd` writeback (ADR-005 outbound, wave 1). Watches the page store
 * for one workspace, debounces 800 ms (trailing edge), plans diff against the
 * last flushed snapshot and runs it against the sandbox. One run at a time:
 * a change arriving mid-run re-schedules itself. The baseline is the store as
 * it is at every activation (mount, workspace switch, sandbox back online):
 * edits made while inactive are the attach reconcile's job, not this writer's.
 * Ponytail: the snapshot advances before the run, so a write that FAILED is not
 * retried until that page changes again or the next attach reconciles it.
 */
export function usePageFileWriter(workspaceId: string, enabled: boolean): void {
  const online = useSandboxHealthStore((s) => isSandboxOnline(s.state));
  useEffect(() => {
    if (!enabled || !online || !workspaceId) return;
    const provider = createSandboxProvider("sandbox", bridgeFsTransport(workspaceId));
    const io = sandboxIo(provider, workspaceId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let pending = false;
    let lastSeen: readonly PageEntry[] = usePageStore.getState().pages[workspaceId] ?? [];
    let flushed: Snapshot | null =
      lastSeen.length === 0 ? null : { index: pageIndexFor(workspaceId, lastSeen), pages: lastSeen };
    let disposed = false;
    // The baseline already holds every removal made while this writer was off, so none of their
    // intents can be planned now; one kept would allow a later remove its user never asked for.
    clearAppRemovals(workspaceId);

    const flush = async (): Promise<void> => {
      if (disposed || running) {
        pending = true;
        return;
      }
      running = true;
      pending = false;
      try {
        const pages = usePageStore.getState().pages[workspaceId] ?? [];
        if (pages.length === 0) return; // nothing to write; keep the baseline
        const index = pageIndexFor(workspaceId, pages);
        const byId = new Map(pages.map((page) => [page._id, page]));
        forgetLiveAppRemovals(workspaceId, (id) => {
          const page = byId.get(id);
          return page !== undefined && !page.archivedAt;
        });
        const plan = planOutbound(flushed, { index, pages });
        flushed = { index, pages };
        if (plan.moves.length === 0 && plan.removes.length === 0 && plan.changed.length === 0) return;
        const run = await runOutbound({
          workspaceId,
          plan,
          pageById: (id) => byId.get(id),
          pathOf: (id) => index.pathForId(id),
          io,
          mayRemove: (id) => takeAppRemoval(workspaceId, id),
        });
        summarize(workspaceId, run.report);
      } finally {
        running = false;
        if (pending) void flush();
      }
    };

    const unsubscribe = usePageStore.subscribe((state) => {
      const pages = state.pages[workspaceId] ?? [];
      if (pages === lastSeen) return; // unrelated store update / unchanged array
      lastSeen = pages;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        void flush();
      }, WRITE_DEBOUNCE_MS);
    });

    return () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      unsubscribe();
    };
  }, [workspaceId, enabled, online]);
}
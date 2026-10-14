/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundLive.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The inbound session over the live store, the sandbox and real timers. The only
// module that wires them, so the session itself stays importable under node.

import { getActivePageJwt } from "@/shared/api/client";
import { pagesPulledAt } from "@/store/pageStore.actions";
import { usePageStore } from "@/store/usePageStore";
import { pageFileStoreDeps } from "@/features/page-file/model/pageFileFacadeStore";

import { bridgeFsTransport } from "../vfs/bridgeTransport";
import { createSandboxProvider } from "../vfs/sandboxProvider";
import { sandboxHashes, type FsOpTransport } from "../vfs/sandboxFsOps";
import { ideOutput } from "./ideOutputBus";
import { statInProvider, statManyInSandbox } from "./inboundArchive";
import { createInboundSession, type InboundSession } from "./inboundSession";
import { attachSummary, attachWorkspace, loadUnloadedBodies } from "./materialize";
import { syncedHashOf } from "./ideSyncEngine";

import type { Schedule } from "./inboundPending";
import { attachUnderLead, type SerialQueue } from "./inboundPipeline";
import type { FsProvider } from "../vfs/types";

// Ponytail: a hidden tab's timers are throttled (Chrome: about once a minute
// after five hidden minutes), so a shell delete can archive its page late —
// late only, never early. Focusing the tab lets the window close on time.
const schedule: Schedule = (run, ms) => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

export interface LiveInbound {
  session: InboundSession;
  /** The "ready" task: reconcile the tree, then one Output line with the counts. */
  attach(): Promise<void>;
}

export function createLiveInbound(workspaceId: string, queue: SerialQueue): LiveInbound {
  const transport = bridgeFsTransport(workspaceId);
  const sandbox = createSandboxProvider("sandbox", transport);
  const session = createInboundSession({
    workspaceId,
    store: pageFileStoreDeps(workspaceId),
    restore: (pageId) => usePageStore.getState().restorePage(pageId, workspaceId, getActivePageJwt() ?? ""),
    stat: (path) => statInProvider(sandbox, workspaceId, path),
    statMany: (paths) => statManyInSandbox(transport, paths),
    schedule,
    enqueue: (task) => { void queue.run(task); },
  });
  return { session, attach: () => attachSandbox(workspaceId, session, sandbox, transport) };
}

// Caveat: 30 s is a guess at the slowest page-list pull; a pull still running then leaves
// this attach unable to open removals (retention), and the next attach tries again.
const PULL_WAIT_MS = 30_000;

/** Resolves once the workspace's page list is not loading, or after `ms`. */
function pagesLoaded(workspaceId: string, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (!usePageStore.getState().loadingIds.has(workspaceId)) return resolve();
    const done = () => { clearTimeout(timer); stop(); resolve(); };
    const timer = setTimeout(done, ms);
    const stop = usePageStore.subscribe((state) => { if (!state.loadingIds.has(workspaceId)) done(); });
  });
}

/**
 * Pulls the page list again and waits for it to land: true when a pull landed after `since`.
 * fetchPages returns at once while another pull is in flight (the first load, at startup), so
 * that one is awaited instead.
 * Caveat: a pull already in flight was sent before `since`; a takeover in that window sees the
 * tree as of the send.
 */
async function pullPages(workspaceId: string, jwt: string, since: number): Promise<boolean> {
  await usePageStore.getState().fetchPages(workspaceId, jwt, true);
  await pagesLoaded(workspaceId, PULL_WAIT_MS);
  return (pagesPulledAt(workspaceId) ?? 0) >= since;
}

/**
 * The "ready" task, and the first task of a tab that gains the lead (useIdeFsSync). It pulls
 * the pages before reconciling, so a tab that took the lead stale sees the leader's last
 * `rm -rf && git clone` first; only then may it remove what its user trashes (inboundPipeline
 * attachUnderLead, devil D5-L7).
 */
async function attachSandbox(workspaceId: string, session: InboundSession, provider: FsProvider, transport: FsOpTransport): Promise<void> {
  const settled = attachUnderLead(workspaceId);
  const since = Date.now();
  const jwt = getActivePageJwt();
  const pulled = jwt ? await pullPages(workspaceId, jwt, since) : false;
  if (jwt) {
    const fetchBody = (pageId: string) => usePageStore.getState().fetchPageContent(pageId, jwt);
    await loadUnloadedBodies(session.views, fetchBody, (path) => syncedHashOf(workspaceId, path) !== null);
  }
  const theirsHashes = (paths: readonly string[]) => sandboxHashes(transport, paths);
  const result = await attachWorkspace({ workspaceId, session, provider, theirsHashes });
  ideOutput("fs-sync", attachSummary(result));
  if (result.failed > 0) console.warn(`[ide] materialize: ${result.failed} files failed to reach the sandbox`);
  if (pulled) settled();
}

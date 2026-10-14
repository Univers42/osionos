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
import { attachUnderLead, leadsInbound, type SerialQueue } from "./inboundPipeline";
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
  /** The "ready" task: reconcile the tree, or emit ATTACH_DEFERRED and arm the retry. */
  attach(): Promise<void>;
}

/** The Output line a deferred attach leaves behind: the pull did not land, so nothing was
 *  reconciled against the localStorage page cache; the same task is retried. */
export const ATTACH_DEFERRED = "sandbox attached — not reconciled, the pages did not load from the server; retrying";

/** One effect's defer debt: the armed retry, its backoff step, and the teardown flag. */
interface RetryState {
  timer: ReturnType<typeof setTimeout> | undefined;
  attempt: number;
  disposed: boolean;
}

/** attachSandbox's inputs: the live tab's sandbox side. The JWT is read at run time. */
interface AttachDeps {
  workspaceId: string;
  session: InboundSession;
  provider: FsProvider;
  transport: FsOpTransport;
}

type AttachOutcome = "reconciled" | "deferred";

/**
 * Builds the live session for one sync effect. The returned session's dispose is the effect's
 * cleanup and is what stops the defer retry; the returned attach is O(files) — attachSandbox.
 * O(1) to build.
 */
export function createLiveInbound(workspaceId: string, queue: SerialQueue): LiveInbound {
  const transport = bridgeFsTransport(workspaceId);
  const sandbox = createSandboxProvider("sandbox", transport);
  const retry: RetryState = { timer: undefined, attempt: 0, disposed: false };
  const enqueue = (task: () => Promise<void>): void => { void queue.run(task); };
  const inner = createInboundSession({
    workspaceId,
    store: pageFileStoreDeps(workspaceId),
    restore: (pageId) => usePageStore.getState().restorePage(pageId, workspaceId, getActivePageJwt() ?? ""),
    stat: (path) => statInProvider(sandbox, workspaceId, path),
    statMany: (paths) => statManyInSandbox(transport, paths),
    schedule,
    enqueue,
  });
  const session: InboundSession = {
    ...inner,
    // The sync effect's cleanup is the only disposal this session gets: no timer outlives it.
    dispose(): void { retry.disposed = true; clearRetry(retry); inner.dispose(); },
  };
  // Every "ready" re-enters here, so it supersedes whatever retry was armed before it.
  const attach = async (): Promise<void> => {
    // A retry whose timer fired before dispose is still queued behind the task in
    // front of it: the session is gone by then, so this attach touches nothing at
    // all — no pull, no provider call, no Output line.
    if (retry.disposed) return;
    clearRetry(retry);
    const outcome = await attachSandbox({ workspaceId, session, provider: sandbox, transport });
    if (outcome === "reconciled") { retry.attempt = 0; return; }
    armRetry(retry, enqueue, attach, workspaceId);
  };
  return { session, attach };
}

// The retry backoff for a deferred attach: 5 s, 15 s, 30 s, then every 60 s.
// Ponytail: the schedule counts attempts, not the outage — a server down for an hour costs
// 60 retries of one `/api/pages/all` each, and a pull that lands in between is reconciled
// only when the retry that comes next pulls again.
const RETRY_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000];

/** Drops a pending retry: a later attach, or the effect's teardown, supersedes it. O(1). */
function clearRetry(retry: RetryState): void {
  if (retry.timer !== undefined) clearTimeout(retry.timer);
  retry.timer = undefined;
}

/**
 * Re-queues `task` on the next backoff step, unless the effect is disposed or the tab
 * stopped leading the workspace (the check routeFsEvent makes): a follower's retry is
 * dropped, and its next leadership gain or "ready" attaches instead. O(1).
 */
function armRetry(retry: RetryState, enqueue: (task: () => Promise<void>) => void, task: () => Promise<void>, workspaceId: string): void {
  if (retry.disposed) return;
  const delay = RETRY_BACKOFF_MS[Math.min(retry.attempt, RETRY_BACKOFF_MS.length - 1)];
  retry.attempt += 1;
  retry.timer = setTimeout(() => {
    retry.timer = undefined;
    if (leadsInbound(workspaceId)) enqueue(task);
  }, delay);
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
 * attachUnderLead, devil D5-L7). A pull that did not land leaves the sandbox untouched: the
 * localStorage page cache is never reconciled before the server load (devil A2, 2026-10-14).
 * O(files) provider calls, through attachWorkspace.
 */
async function attachSandbox(deps: AttachDeps): Promise<AttachOutcome> {
  const { workspaceId, session, provider, transport } = deps;
  const settled = attachUnderLead(workspaceId);
  const since = Date.now();
  const jwt = getActivePageJwt();
  const pulled = jwt ? await pullPages(workspaceId, jwt, since) : false;
  if (!pulled) {
    ideOutput("fs-sync", ATTACH_DEFERRED);
    return "deferred";
  }
  if (jwt) {
    const fetchBody = (pageId: string) => usePageStore.getState().fetchPageContent(pageId, jwt);
    await loadUnloadedBodies(session.views, fetchBody, (path) => syncedHashOf(workspaceId, path) !== null);
  }
  const theirsHashes = (paths: readonly string[]) => sandboxHashes(transport, paths);
  const result = await attachWorkspace({ workspaceId, session, provider, theirsHashes });
  ideOutput("fs-sync", attachSummary(result));
  if (result.failed > 0) console.warn(`[ide] materialize: ${result.failed} files failed to reach the sandbox`);
  settled();
  return "reconciled";
}

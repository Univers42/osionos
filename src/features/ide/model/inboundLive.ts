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
import { usePageStore } from "@/store/usePageStore";
import { pageFileStoreDeps } from "@/features/page-file/model/pageFileFacadeStore";

import { bridgeFsTransport } from "../vfs/bridgeTransport";
import { createSandboxProvider } from "../vfs/sandboxProvider";
import { sandboxHashes, type FsOpTransport } from "../vfs/sandboxFsOps";
import { ideOutput } from "./ideOutputBus";
import { statInProvider } from "./inboundArchive";
import { createInboundSession, type InboundSession } from "./inboundSession";
import { attachWorkspace, loadUnloadedBodies } from "./materialize";
import { syncedHashOf } from "./ideSyncEngine";

import type { Schedule } from "./inboundPending";
import type { SerialQueue } from "./inboundPipeline";
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
    schedule,
    enqueue: (task) => { void queue.run(task); },
  });
  return { session, attach: () => attachSandbox(workspaceId, session, sandbox, transport) };
}

async function attachSandbox(workspaceId: string, session: InboundSession, provider: FsProvider, transport: FsOpTransport): Promise<void> {
  const jwt = getActivePageJwt();
  if (jwt) {
    const fetchBody = (pageId: string) => usePageStore.getState().fetchPageContent(pageId, jwt);
    await loadUnloadedBodies(session.views, fetchBody, (path) => syncedHashOf(workspaceId, path) !== null);
  }
  const theirsHashes = (paths: readonly string[]) => sandboxHashes(transport, paths);
  const { written, unloaded, failed } = await attachWorkspace({ workspaceId, session, provider, theirsHashes });
  const tail = `${unloaded > 0 ? `, ${unloaded} not loaded yet` : ""}${failed > 0 ? `, ${failed} FAILED` : ""}`;
  ideOutput("fs-sync", `sandbox attached — materialized ${written} files${tail}`);
  if (failed > 0) console.warn(`[ide] materialize: ${failed} files failed to reach the sandbox`);
}

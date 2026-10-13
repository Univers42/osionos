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
import { statInProvider } from "./inboundArchive";
import { createInboundSession, type InboundSession } from "./inboundSession";

import type { Schedule } from "./inboundPending";
import type { SerialQueue } from "./inboundPipeline";

// Ponytail: a hidden tab's timers are throttled (Chrome: about once a minute
// after five hidden minutes), so a shell delete can archive its page late —
// late only, never early. Focusing the tab lets the window close on time.
const schedule: Schedule = (run, ms) => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

export function createLiveInboundSession(workspaceId: string, queue: SerialQueue): InboundSession {
  const sandbox = createSandboxProvider("sandbox", bridgeFsTransport(workspaceId));
  return createInboundSession({
    workspaceId,
    store: pageFileStoreDeps(workspaceId),
    restore: (pageId) => usePageStore.getState().restorePage(pageId, workspaceId, getActivePageJwt() ?? ""),
    stat: (path) => statInProvider(sandbox, workspaceId, path),
    schedule,
    enqueue: (task) => { void queue.run(task); },
  });
}

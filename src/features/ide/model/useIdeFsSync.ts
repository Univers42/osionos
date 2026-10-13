/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useIdeFsSync.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";

import { API_BASE, getActivePageJwt } from "@/shared/api/client";
import { ideWsProtocols } from "./useIdeTerminal";
import { parseFsEvent } from "./ideFsEcho";
import { publishFsEvent } from "./ideFsEvents";
import { ideOutput } from "./ideOutputBus";
import { createReconnectBackoff } from "./reconnectBackoff";
import { isSandboxOnline, useSandboxHealthStore } from "./sandboxHealthStore";
import { isDeliberateClose } from "./wsCloseCodes";
import { applyFsEvent } from "./applyFsEvent";
import { createSerialQueue, acquireInboundLeadership } from "./inboundPipeline";

/**
 * Live writeback (P4): streams the in-sandbox fs-agent's events, PUBLISHES them
 * on the per-workspace bus (the sandbox:// provider's watch() rides the same
 * socket), and maps them onto the page mount via the sync engine. On "ready"
 * it materializes the tree. Dials only while the shared sandbox health is online;
 * a deliberate server close parks (health store owns the state, no timer), any
 * other close re-probes and reconnects with 1s/4s/15s backoff (reconnectBackoff).
 *
 * One serial queue + one Web-Locks leadership per connection: events apply
 * first-in-first-out (a burst of writes can no longer race the ledger), and
 * only the leader tab applies — the bridge runs one fs-agent per socket, so
 * without the lock every open tab would apply every event.
 */
export function useIdeFsSync(workspaceId: string, enabled: boolean): void {
  const online = useSandboxHealthStore((s) => isSandboxOnline(s.state));
  useEffect(() => {
    if (!enabled || !online || !workspaceId || !API_BASE) return;
    let disposed = false;
    // One Output line per outage, re-armed once data flows again — a down
    // sandbox otherwise logs on every backoff attempt.
    let outageLogged = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const backoff = createReconnectBackoff();

    const queue = createSerialQueue((error) => {
      ideOutput("fs-sync", `event failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    // Ponytail: only APPLYING is leader-only. A follower tab's outbound writer
    // still writes files with its own echo set and ledger, so the leader sees
    // them as ordinary shell writes: they converge via apply/ignore, and both
    // tabs editing one page yields a spurious conflict (placeholderText is lost
    // on the round trip). Gating the writer too was judged not worth it.
    const leadership = acquireInboundLeadership(workspaceId, globalThis.navigator?.locks);

    const connect = () => {
      const jwt = getActivePageJwt() ?? "";
      if (disposed || !jwt || !isSandboxOnline(useSandboxHealthStore.getState().state)) return;
      const wsBase = API_BASE.replace(/^http/, "ws"); // http→ws, https→wss
      ws = new WebSocket(`${wsBase}/api/ide/fsync?workspaceId=${encodeURIComponent(workspaceId)}`, ideWsProtocols(jwt));
      ws.binaryType = "arraybuffer";

      let buffer = "";
      ws.onmessage = (ev) => {
        backoff.delivered();
        outageLogged = false;
        buffer += typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data);
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const evt = parseFsEvent(line);
          if (!evt) continue;
          publishFsEvent(workspaceId, evt);
          if (leadership.isLeader()) void queue.run(() => applyFsEvent(evt, workspaceId));
        }
      };
      ws.onclose = (ev) => {
        if (disposed) return;
        const health = useSandboxHealthStore.getState();
        if (isDeliberateClose(ev.code)) {
          // Retrying cannot help; the store flips offline and the UI shows Retry.
          health.markClosed(ev.code, ev.reason);
          if (!outageLogged) ideOutput("fs-sync", `sandbox refused the sync socket (${ev.code}) — ${ev.reason || "no reason given"}`);
          outageLogged = true;
          return;
        }
        void health.probe(workspaceId);
        const delayMs = backoff.next();
        if (!outageLogged) {
          ideOutput("fs-sync", `disconnected — reconnecting in ${delayMs / 1000}s`);
          console.warn(`[ide] fs sync disconnected — reconnecting (further attempts are not logged)`);
        }
        outageLogged = true;
        timer = setTimeout(connect, delayMs);
      };
    };

    connect();
    return () => {
      disposed = true;
      leadership.release();
      if (timer) clearTimeout(timer);
      try { ws?.close(); } catch { /* already closed */ }
    };
  }, [workspaceId, enabled, online]);
}

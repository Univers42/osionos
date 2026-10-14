/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useIdeFsSync.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";

import { expiredReconnect, ideSocketTarget } from "../api/ideTransport";
import { parseFsEvent } from "./ideFsEcho";
import { publishFsEvent } from "./ideFsEvents";
import { ideOutput } from "./ideOutputBus";
import { createReconnectBackoff } from "./reconnectBackoff";
import { isSandboxOnline, useSandboxHealthStore } from "./sandboxHealthStore";
import { isDeliberateClose, isTokenExpiredClose } from "./wsCloseCodes";
import { createLiveInbound } from "./inboundLive";
import { createSerialQueue, acquireInboundLeadership } from "./inboundPipeline";
import { routeFsEvent } from "./inboundSession";

/**
 * Live writeback (P4): streams the in-sandbox fs-agent's events, PUBLISHES them
 * on the per-workspace bus (the sandbox:// provider's watch() rides the same
 * socket), and hands them to the inbound session (decode → plan → execute). On
 * "ready" it reconciles the tree. Dials only while the shared sandbox health is online;
 * a deliberate server close parks (health store owns the state, no timer), any
 * other close re-probes and reconnects with 1s/4s/15s backoff (reconnectBackoff).
 *
 * One serial queue + one Web-Locks leadership per connection: events apply
 * first-in-first-out (a burst of writes can no longer race the ledger), and
 * only the leader tab applies — the bridge runs one fs-agent per socket, so
 * without the lock every open tab would apply every event. The session (its
 * delete windows and restore memory) lives exactly as long as the effect (B5).
 */
export function useIdeFsSync(workspaceId: string, enabled: boolean): void {
  const online = useSandboxHealthStore((s) => isSandboxOnline(s.state));
  useEffect(() => {
    if (!enabled || !online || !workspaceId) return;
    let disposed = false;
    // One Output line per outage, re-armed once data flows again — a down
    // sandbox otherwise logs on every backoff attempt.
    let outageLogged = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const backoff = createReconnectBackoff();
    const expired = expiredReconnect();

    const queue = createSerialQueue((error) => {
      ideOutput("fs-sync", `event failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    // Ponytail: only APPLYING and REMOVING are leader-only (removesForItsUser: a
    // remove also needs this tab's app intent, store/appRemovals). A follower
    // tab's outbound writer still writes and moves files with its own echo set
    // and ledger, so the leader sees them as ordinary shell writes: they
    // converge via apply/ignore, and both tabs editing one page yields a
    // spurious conflict (placeholderText is lost on the round trip). Gating
    // those too was judged not worth it.
    const { session, attach } = createLiveInbound(workspaceId, queue);
    // A tab that gains the lead after the socket's "ready" (the leader closed) gets no other
    // one, and must attach before it may remove anything (inboundPipeline attachUnderLead).
    let readySeen = false;
    const leadership = acquireInboundLeadership(workspaceId, globalThis.navigator?.locks, () => {
      if (readySeen) void queue.run(attach);
    });
    const route = { isLeader: () => leadership.isLeader(), queue, session, attach };

    const connect = async () => {
      if (disposed || !isSandboxOnline(useSandboxHealthStore.getState().state)) return;
      const target = await ideSocketTarget(workspaceId, "/api/ide/fsync");
      // Re-checked after the await: health or the effect may have moved while the token was minted.
      if (disposed || !isSandboxOnline(useSandboxHealthStore.getState().state)) return;
      if (target.kind === "unavailable") {
        // Throttled or a failed mint is transient: same backoff as a dropped socket.
        if (target.reason === "throttled" || target.reason === "error") timer = setTimeout(() => void connect(), backoff.next());
        return;
      }
      ws = new WebSocket(target.url, target.protocols);
      ws.binaryType = "arraybuffer";
      ws.onopen = () => expired.opened();

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
          if (evt.event === "ready") readySeen = true;
          publishFsEvent(workspaceId, evt);
          routeFsEvent(evt, route);
        }
      };
      ws.onclose = (ev) => {
        if (disposed) return;
        // IDE token ran out: fresh token and redial at once — no backoff, no health change.
        if (isTokenExpiredClose(ev.code) && expired.onExpired(workspaceId)) {
          void connect();
          return;
        }
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
        timer = setTimeout(() => void connect(), delayMs);
      };
    };

    void connect();
    return () => {
      disposed = true;
      session.dispose();
      leadership.release();
      if (timer) clearTimeout(timer);
      try { ws?.close(); } catch { /* already closed */ }
    };
  }, [workspaceId, enabled, online]);
}

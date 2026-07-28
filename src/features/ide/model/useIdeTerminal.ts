/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useIdeTerminal.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useMemo, useState } from "react";
import type { Terminal } from "@xterm/xterm";

import { API_BASE, getActivePageJwt } from "@/shared/api/client";
import { ideOutput } from "./ideOutputBus";
import { useTerminalRunBus } from "./terminalRunBus";

export type IdeTerminalStatus = "connecting" | "open" | "closed" | "unavailable";

/** Bridge WS URL for the sandbox PTY (P3). The JWT rides the WS subprotocol
 *  (see ideWsProtocols), NOT the URL — query strings land in access logs.
 *  `term` selects the bridge-owned session (ADR-002): reconnects land on the
 *  SAME shell with a replay of recent output. */
function ptyUrl(workspaceId: string, jwt: string, term = "0"): string | null {
  if (!API_BASE || !workspaceId || !jwt) return null;
  const wsBase = API_BASE.replace(/^http/, "ws"); // http→ws, https→wss
  return `${wsBase}/api/ide/pty?workspaceId=${encodeURIComponent(workspaceId)}&term=${term}`;
}

/** Subprotocol pair every IDE WS uses: the app protocol + the auth token. The
 *  bridge selects and echoes "osio-ide.v1"; app-session tokens are header-safe. */
export function ideWsProtocols(jwt: string): string[] {
  return ["osio-ide.v1", `osio-token.${jwt}`];
}

/**
 * Bridges an xterm Terminal to the sandbox PTY over the bridge WebSocket. The
 * server sends stdout as binary frames and writes our frames to stdin; PTY
 * geometry rides an out-of-band APC control frame (kept off stdin) so a wide
 * browser terminal and the in-container shell agree — vim/htop and >80-col line
 * editing render correctly. Network drops auto-reconnect with backoff and land
 * on the SAME bridge-owned session (replay first); deliberate closes (shell
 * exit, auth/gate) stay closed with the reason printed.
 */
export function useIdeTerminal(term: Terminal | null, workspaceId: string, termId = "0"): IdeTerminalStatus {
  // "connecting" until a WS callback moves it; "unavailable" is derived (no
  // synchronous setState in the effect — that trips react-hooks/set-state-in-effect).
  const [wsStatus, setWsStatus] = useState<IdeTerminalStatus>("connecting");
  const url = useMemo(() => (term ? ptyUrl(workspaceId, getActivePageJwt() ?? "", termId) : null), [term, workspaceId, termId]);

  useEffect(() => {
    if (!term || !url) return;
    let disposed = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const sendResize = () => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(`\x1b_osio-resize:${term.cols},${term.rows}\x1b\\`);
    };

    // Drain a parked "Run this file" request into the PTY stdin (a newline
    // submits it) — so `input()` reads from the real terminal, not a closed pipe.
    const runPending = () => {
      if (ws?.readyState !== WebSocket.OPEN) return;
      const cmd = useTerminalRunBus.getState().drain();
      if (cmd) ws.send(cmd.endsWith("\n") ? cmd : cmd + "\n");
    };

    const connect = () => {
      if (disposed) return;
      ws = new WebSocket(url, ideWsProtocols(getActivePageJwt() ?? ""));
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        attempt = 0;
        term.reset(); // the session replay repaints current state — no doubling
        setWsStatus("open");
        sendResize();
        term.focus();
        runPending();
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") term.write(ev.data);
        else term.write(new Uint8Array(ev.data as ArrayBuffer));
      };
      ws.onclose = (ev) => {
        if (disposed) return;
        setWsStatus("closed");
        // Deliberate ends (shell exit, auth/gate refusals) stay closed; network
        // drops reconnect — the bridge-owned session is waiting for us.
        const deliberate = ev.code === 1000 || (ev.code >= 4000 && ev.code !== 4029);
        if (deliberate) {
          const why = ev.reason || "connection closed";
          term.write(`\r\n\x1b[2m[terminal: ${why}]\x1b[0m\r\n`);
          ideOutput("terminal", `session closed: ${why}`);
          return;
        }
        const delayMs = [1000, 4000, 15000][Math.min(attempt, 2)];
        attempt += 1;
        term.write(`\r\n\x1b[2m[terminal: reconnecting in ${delayMs / 1000}s…]\x1b[0m\r\n`);
        ideOutput("terminal", `disconnected (${ev.code}) — reconnecting in ${delayMs / 1000}s`);
        timer = setTimeout(connect, delayMs);
      };
      ws.onerror = () => setWsStatus("closed");
    };

    connect();
    const dataSub = term.onData((d) => { if (ws?.readyState === WebSocket.OPEN) ws.send(d); });
    const resizeSub = term.onResize(() => sendResize());
    // A Run requested while the terminal is already connected fires immediately.
    const runSub = useTerminalRunBus.subscribe((s, prev) => { if (s.seq !== prev.seq) runPending(); });

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      dataSub.dispose();
      resizeSub.dispose();
      runSub();
      try { ws?.close(); } catch { /* already closed */ }
    };
  }, [term, url]);

  return term && !url ? "unavailable" : wsStatus;
}

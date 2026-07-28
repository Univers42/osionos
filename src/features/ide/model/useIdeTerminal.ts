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
import { useTerminalRunBus } from "./terminalRunBus";

export type IdeTerminalStatus = "connecting" | "open" | "closed" | "unavailable";

/** Bridge WS URL for the sandbox PTY (P3). The JWT rides the WS subprotocol
 *  (see ideWsProtocols), NOT the URL — query strings land in access logs. */
function ptyUrl(workspaceId: string, jwt: string): string | null {
  if (!API_BASE || !workspaceId || !jwt) return null;
  const wsBase = API_BASE.replace(/^http/, "ws"); // http→ws, https→wss
  return `${wsBase}/api/ide/pty?workspaceId=${encodeURIComponent(workspaceId)}`;
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
 * editing render correctly.
 * ponytail: no auto-reconnect — the panel remounts on reopen; add backoff only
 * if flaky links prove it necessary.
 */
export function useIdeTerminal(term: Terminal | null, workspaceId: string): IdeTerminalStatus {
  // "connecting" until a WS callback moves it; "unavailable" is derived (no
  // synchronous setState in the effect — that trips react-hooks/set-state-in-effect).
  const [wsStatus, setWsStatus] = useState<IdeTerminalStatus>("connecting");
  const url = useMemo(() => (term ? ptyUrl(workspaceId, getActivePageJwt() ?? "") : null), [term, workspaceId]);

  useEffect(() => {
    if (!term || !url) return;
    const ws = new WebSocket(url, ideWsProtocols(getActivePageJwt() ?? ""));
    ws.binaryType = "arraybuffer";

    const sendResize = () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(`\x1b_osio-resize:${term.cols},${term.rows}\x1b\\`);
    };

    // Drain a parked "Run this file" request into the PTY stdin (a newline
    // submits it) — so `input()` reads from the real terminal, not a closed pipe.
    const runPending = () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const cmd = useTerminalRunBus.getState().drain();
      if (cmd) ws.send(cmd.endsWith("\n") ? cmd : cmd + "\n");
    };

    ws.onopen = () => { setWsStatus("open"); sendResize(); term.focus(); runPending(); };
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") term.write(ev.data);
      else term.write(new Uint8Array(ev.data as ArrayBuffer));
    };
    ws.onclose = (ev) => {
      setWsStatus("closed");
      const why = ev.reason || (ev.code === 1000 ? "connection closed" : `connection closed (${ev.code})`);
      term.write(`\r\n\x1b[2m[terminal: ${why}]\x1b[0m\r\n`);
    };
    ws.onerror = () => setWsStatus("closed");

    const dataSub = term.onData((d) => { if (ws.readyState === WebSocket.OPEN) ws.send(d); });
    const resizeSub = term.onResize(() => sendResize());
    // A Run requested while the terminal is already connected fires immediately.
    const runSub = useTerminalRunBus.subscribe((s, prev) => { if (s.seq !== prev.seq) runPending(); });

    return () => {
      dataSub.dispose();
      resizeSub.dispose();
      runSub();
      try { ws.close(); } catch { /* already closed */ }
    };
  }, [term, url]);

  return term && !url ? "unavailable" : wsStatus;
}

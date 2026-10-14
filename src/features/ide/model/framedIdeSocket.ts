/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   framedIdeSocket.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { ideSocketTarget } from "../api/ideTransport";
import { invalidateIdeToken } from "../api/ideToken";
import { frameLsp, createLspFramer } from "./lspFraming";
import { isTokenExpiredClose } from "./wsCloseCodes";
import type { Transport } from "./lspProtocol";

// Every IDE server socket: the LSP relay and the debug-adapter relay both mint a
// token, speak `Content-Length` framed JSON over one WebSocket and expire on the
// same close code, so the wiring lives here once and each caller adds only what
// is specific to its own relay through `onClose`.

interface SocketWiring {
  subs: Set<(message: string) => void>;
  framer: ReturnType<typeof createLspFramer>;
  outbox: Uint8Array[];
  workspaceId: string;
  settle(): void;
  onClose?: (code: number) => void;
}

/** Wire one open socket: replay the queue, deframe in, report the close code.
 *  O(queued frames) on open, O(bytes received) per message. */
function attach(socket: WebSocket, wiring: SocketWiring): void {
  socket.binaryType = "arraybuffer";
  socket.onopen = () => { for (const f of wiring.outbox) socket.send(f); wiring.outbox.length = 0; };
  socket.onmessage = (ev) => {
    const bytes = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : new TextEncoder().encode(String(ev.data));
    wiring.framer.feed(bytes, (msg) => { for (const h of wiring.subs) h(msg); });
  };
  // Expired token: the connection is dropped like any close and the next dial mints
  // again, so only the cached token needs to go. Ponytail: no in-place redial, so a long
  // open socket keeps whatever the old relay last said until the next one is dialed.
  socket.addEventListener("close", (ev) => {
    if (isTokenExpiredClose(ev.code)) invalidateIdeToken(wiring.workspaceId);
    wiring.onClose?.(ev.code);
    wiring.settle();
  });
  socket.addEventListener("error", () => wiring.settle());
}

/** A framed socket to an IDE relay (`path` + `params`), queued until open. O(1) to dial,
 *  O(queued frames) to flush on open. `closed` settles on close, error, or when no socket
 *  could be made. */
export function connectFramedIdeSocket(
  path: string,
  params: Record<string, string>,
  workspaceId: string,
  onClose?: (code: number) => void,
): { transport: Transport; closed: Promise<void>; close: () => void } {
  const subs = new Set<(message: string) => void>();
  const framer = createLspFramer();
  const outbox: Uint8Array[] = [];
  let ws: WebSocket | null = null;
  let stopped = false;
  let settle: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => { settle = resolve; });

  const dial = async (): Promise<void> => {
    const target = await ideSocketTarget(workspaceId, path, params);
    if (stopped || target.kind === "unavailable") {
      settle();
      return;
    }
    ws = new WebSocket(target.url, target.protocols);
    attach(ws, { subs, framer, outbox, workspaceId, settle, onClose });
  };
  // A mint that throws must still settle `closed`, or the connection is never dropped and redialled.
  dial().catch(() => settle());

  const transport: Transport = {
    send(message) {
      const framed = frameLsp(message);
      if (ws?.readyState === WebSocket.OPEN) ws.send(framed);
      else outbox.push(framed);
    },
    subscribe(h) { subs.add(h); },
    unsubscribe(h) { subs.delete(h); },
  };
  const close = (): void => {
    stopped = true;
    try { ws?.close(); } catch { /* already closed */ }
  };
  return { transport, closed, close };
}
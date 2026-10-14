/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dapSession.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Transport } from "./lspProtocol";

// A Debug Adapter Protocol client over the same bare-JSON-string Transport the LSP
// client uses (the IDE relay frames with `Content-Length`, lspFraming.ts). It knows
// sequence numbers, request/response correlation, events and the reverse requests an
// adapter sends the client; it has no idea what it is debugging, so the same session
// would drive any language's adapter.

/** Per-request budget. Ponytail: a cold debugpy start on a loaded sandbox that answers
 *  slower than this fails the whole run rather than waiting; a too-short budget only ever
 *  cuts the run short, never a wrong answer. */
const DEFAULT_TIMEOUT_MS = 10_000;

export type DapEventHandler = (event: string, body: unknown) => void;

export interface DapSessionOptions {
  /** Per-request budget in ms. */
  timeoutMs?: number;
}

interface DapMessage {
  type?: string;
  seq?: number;
  command?: string;
  request_seq?: number;
  success?: boolean;
  message?: string;
  event?: string;
  body?: unknown;
}

interface Pending {
  command: string;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export class DapSession {
  private readonly transport: Transport;
  private readonly timeoutMs: number;
  private readonly pending = new Map<number, Pending>();
  private readonly handlers = new Set<DapEventHandler>();
  private seq = 0;
  private disposed = false;
  private readonly onMessage = (raw: string): void => this.dispatch(raw);

  constructor(transport: Transport, opts: DapSessionOptions = {}) {
    this.transport = transport;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    transport.subscribe(this.onMessage);
  }

  /** Send a request and settle on its response. O(1) per call, O(1) per pending set. */
  request<T>(command: string, args?: object): Promise<T> {
    if (this.disposed) return Promise.reject(new Error(`DAP ${command}: session disposed`));
    const seq = ++this.seq;
    const transport = this.transport;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`DAP ${command} timed out after ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      this.pending.set(seq, { command, resolve: (value) => resolve(value as T), reject, timer });
      transport.send(JSON.stringify({ seq, type: "request", command, arguments: args ?? {} }));
    });
  }

  /** Listen to adapter events; the returned function unsubscribes. O(1). */
  onEvent(handler: DapEventHandler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  /** Stop listening and fail every in-flight request. Idempotent. O(pending). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.transport.unsubscribe(this.onMessage);
    for (const [seq, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(`DAP ${entry.command}: session disposed`));
      this.pending.delete(seq);
    }
    this.handlers.clear();
  }

  /** Route one framed message. A torn frame, a non-object and an unknown type are all dropped. O(1). */
  private dispatch(raw: string): void {
    let msg: DapMessage | null;
    try { msg = JSON.parse(raw) as DapMessage | null; } catch { return; }
    if (typeof msg !== "object" || msg === null) return;
    if (msg.type === "response") this.settle(msg);
    else if (msg.type === "event") this.emit(msg);
    else if (msg.type === "request") this.refuse(msg);
  }

  /** Resolve or reject the request `request_seq` points at. O(1). */
  private settle(msg: DapMessage): void {
    if (typeof msg.request_seq !== "number") return;
    const entry = this.pending.get(msg.request_seq);
    if (!entry) return;
    this.pending.delete(msg.request_seq);
    clearTimeout(entry.timer);
    if (msg.success) entry.resolve(msg.body);
    else entry.reject(new Error(typeof msg.message === "string" ? msg.message : `${entry.command} failed`));
  }

  /** Fan an event out to the subscribers, snapshot first so one may unsubscribe. O(subscribers). */
  private emit(msg: DapMessage): void {
    if (typeof msg.event !== "string") return;
    for (const handler of [...this.handlers]) {
      try { handler(msg.event, msg.body); }
      catch { /* a broken panel must not kill the session */ }
    }
  }

  // The adapter is the server: it asks the client to run a terminal or to launch a
  // nested session. The IDE can do neither, and answering "not supported" (rather
  // than staying silent) is what keeps debugpy from waiting forever on us.
  /** Refuse a reverse request, always. O(1). */
  private refuse(msg: DapMessage): void {
    this.transport.send(JSON.stringify({
      seq: ++this.seq,
      type: "response",
      request_seq: msg.seq ?? 0,
      command: typeof msg.command === "string" ? msg.command : "",
      success: false,
      message: "not supported",
    }));
  }
}
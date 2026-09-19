/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   lspProtocol.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A dependency-free Language Server Protocol client: JSON-RPC 2.0 over a
// `Transport` that exchanges bare JSON strings (framing is the transport's job —
// see lspFraming.ts). It owns the `initialize` handshake, request/response
// correlation with a per-request timeout, server→client notifications, and the
// few server→client REQUESTS a real server sends (clangd/pyright ask for
// `workspace/configuration` and `client/registerCapability` right after
// `initialize`; an unanswered one stalls some servers). No editor import here:
// the canvas suite runs this file under node, and the Monaco adapter
// (lspMonaco.ts) stays a thin layer over it.

export interface Transport {
  send(message: string): void;
  subscribe(handler: (message: string) => void): void;
  unsubscribe(handler: (message: string) => void): void;
}

export interface LspPosition { line: number; character: number }
export interface LspRange { start: LspPosition; end: LspPosition }
export interface LspLocation { uri: string; range: LspRange }
export interface LspLocationLink { targetUri: string; targetRange: LspRange; targetSelectionRange?: LspRange }
export interface LspTextEdit { range: LspRange; newText: string }
export interface LspInsertReplaceEdit { newText: string; insert: LspRange; replace: LspRange }
export interface LspMarkupContent { kind: "plaintext" | "markdown"; value: string }
export type LspMarkedString = string | { language: string; value: string };
export interface LspHover { contents: LspMarkupContent | LspMarkedString | LspMarkedString[]; range?: LspRange }
export interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | LspMarkupContent;
  insertText?: string;
  insertTextFormat?: number;
  textEdit?: LspTextEdit | LspInsertReplaceEdit;
  additionalTextEdits?: LspTextEdit[];
  filterText?: string;
  sortText?: string;
}
export interface LspCompletionList { isIncomplete: boolean; items: LspCompletionItem[] }
export interface LspDiagnostic { range: LspRange; severity?: number; message: string; source?: string; code?: string | number }
export interface LspParameterInformation { label: string | [number, number]; documentation?: string | LspMarkupContent }
export interface LspSignatureInformation { label: string; documentation?: string | LspMarkupContent; parameters?: LspParameterInformation[] }
export interface LspSignatureHelp { signatures: LspSignatureInformation[]; activeSignature?: number; activeParameter?: number }

export type NotificationHandler = (params: unknown) => void;

export interface LspClientOptions {
  rootUri?: string;
  /** Per-request budget in ms (the `initialize` request included). */
  timeout?: number;
  notificationHandlers?: Record<string, NotificationHandler>;
}

interface RpcMessage {
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

const CLIENT_CAPABILITIES = {
  textDocument: {
    synchronization: { dynamicRegistration: false, willSave: false, willSaveWaitUntil: false, didSave: false },
    completion: {
      dynamicRegistration: false,
      contextSupport: true,
      completionItem: { snippetSupport: true, insertReplaceSupport: true, documentationFormat: ["markdown", "plaintext"] },
      completionItemKind: { valueSet: Array.from({ length: 25 }, (_, i) => i + 1) },
    },
    hover: { dynamicRegistration: false, contentFormat: ["markdown", "plaintext"] },
    signatureHelp: {
      dynamicRegistration: false,
      signatureInformation: { documentationFormat: ["markdown", "plaintext"], parameterInformation: { labelOffsetSupport: true } },
    },
    definition: { dynamicRegistration: false, linkSupport: true },
    publishDiagnostics: { relatedInformation: false },
  },
  workspace: { configuration: true, workspaceFolders: true },
  general: { positionEncodings: ["utf-16"] },
};

export class LspClient {
  /** Settles once the server answered `initialize` (and `initialized` was sent);
   *  rejects when that request fails or times out. Always has a handler attached
   *  so a dead server never surfaces as an uncaught rejection. */
  readonly initializing: Promise<void>;
  private transport: Transport | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly handlers: Record<string, NotificationHandler>;
  private readonly timeout: number;
  private readonly rootUri: string | null;
  private disconnected = false;
  private settleInit: { resolve(): void; reject(error: Error): void } | null = null;
  private readonly onMessage = (raw: string): void => this.dispatch(raw);

  constructor(options: LspClientOptions = {}) {
    this.timeout = options.timeout ?? 3000;
    this.rootUri = options.rootUri ?? null;
    this.handlers = options.notificationHandlers ?? {};
    this.initializing = new Promise<void>((resolve, reject) => { this.settleInit = { resolve, reject }; });
    this.initializing.catch(() => undefined);
  }

  connect(transport: Transport): this {
    this.transport = transport;
    transport.subscribe(this.onMessage);
    const params = {
      processId: null,
      rootUri: this.rootUri,
      workspaceFolders: this.rootUri ? [{ uri: this.rootUri, name: "workspace" }] : null,
      capabilities: CLIENT_CAPABILITIES,
    };
    this.request("initialize", params).then(
      () => { this.notify("initialized", {}); this.settleInit?.resolve(); },
      (error: unknown) => this.settleInit?.reject(error instanceof Error ? error : new Error(String(error))),
    );
    return this;
  }

  request<T>(method: string, params: unknown): Promise<T> {
    if (this.disconnected || !this.transport) return Promise.reject(new Error(`LSP request ${method}: client is disconnected`));
    const id = this.nextId++;
    const transport = this.transport;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`LSP request ${method} timed out after ${this.timeout} ms`));
      }, this.timeout);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      transport.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  notify(method: string, params: unknown): void {
    if (this.disconnected || !this.transport) return;
    this.transport.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  /** Stop listening and fail every in-flight request. Idempotent. */
  disconnect(): void {
    if (this.disconnected) return;
    this.disconnected = true;
    this.transport?.unsubscribe(this.onMessage);
    for (const [id, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(new Error("LSP client disconnected"));
      this.pending.delete(id);
    }
    this.settleInit?.reject(new Error("LSP client disconnected"));
  }

  private dispatch(raw: string): void {
    let msg: RpcMessage;
    try { msg = JSON.parse(raw) as RpcMessage; } catch { return; } // a torn frame is dropped, never fatal
    if (typeof msg.method === "string") {
      if (msg.id === undefined || msg.id === null) this.handlers[msg.method]?.(msg.params);
      else this.answerServerRequest(msg.id, msg.method, msg.params);
      return;
    }
    if (typeof msg.id !== "number") return;
    const req = this.pending.get(msg.id);
    if (!req) return;
    this.pending.delete(msg.id);
    clearTimeout(req.timer);
    if (msg.error) req.reject(new Error(`LSP ${msg.error.message} (code ${msg.error.code})`));
    else req.resolve(msg.result);
  }

  // The client has no settings UI, so every configuration request gets "use your
  // defaults" (one null per requested item); other server requests are
  // acknowledged with a null result rather than left hanging.
  private answerServerRequest(id: number | string, method: string, params: unknown): void {
    let result: unknown = null;
    if (method === "workspace/configuration") {
      const items = (params as { items?: unknown[] } | undefined)?.items;
      result = Array.isArray(items) ? items.map(() => null) : [];
    }
    this.transport?.send(JSON.stringify({ jsonrpc: "2.0", id, result }));
  }
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   lspClient.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Extension } from "@codemirror/state";
import { LSPClient, languageServerSupport, type Transport } from "@codemirror/lsp-client";

import { API_BASE, getActivePageJwt } from "@/shared/api/client";
import { frameLsp, createLspFramer } from "./lspFraming";
import { ideWsProtocols } from "./useIdeTerminal";
import { useDiagnosticsStore, type IdeDiagnostic } from "./diagnosticsStore";
import { LSP_REQUEST_TIMEOUT_MS, whenInitialized } from "./lspReady";

// CodeMirror languageId → sandbox LSP server key (bridge LSP_SERVERS). Only these
// have a server installed in the sandbox image; anything else → no LSP. clangd
// serves both C and C++.
const LSP_SERVER: Record<string, string> = {
  typescript: "typescript", tsx: "typescript", javascript: "typescript", jsx: "typescript",
  python: "python",
  go: "go",
  rust: "rust",
  c: "clangd", cpp: "clangd",
};
// CodeMirror languageId → the LSP `languageId` the server expects on didOpen.
const LSP_DOC_LANG: Record<string, string> = {
  typescript: "typescript", tsx: "typescriptreact", javascript: "javascript", jsx: "javascriptreact",
  python: "python",
  go: "go",
  rust: "rust",
  c: "c", cpp: "cpp",
};

/** The sandbox LSP server key for a CodeMirror language, or null if none. */
export function lspServerFor(languageId: string): string | null {
  return LSP_SERVER[languageId] ?? null;
}

interface RawDiagnostic {
  severity?: number;
  message?: string;
  source?: string;
  range?: { start?: { line?: number; character?: number } };
}

function mapDiagnostic(uri: string, d: RawDiagnostic): IdeDiagnostic {
  return {
    uri,
    severity: typeof d.severity === "number" ? d.severity : 1,
    message: String(d.message ?? ""),
    line: d.range?.start?.line ?? 0,
    character: d.range?.start?.character ?? 0,
    source: d.source,
  };
}

/** A WebSocket LSP transport with the base-protocol codec (send frames, deframe
 *  received bytes). Queues sends until the socket opens. */
function connect(serverLang: string, workspaceId: string): { transport: Transport; ws: WebSocket } {
  const jwt = getActivePageJwt() ?? "";
  const wsBase = (API_BASE || "").replace(/^http/, "ws"); // http→ws, https→wss
  const url = `${wsBase}/api/ide/lsp?workspaceId=${encodeURIComponent(workspaceId)}&lang=${serverLang}`;
  const ws = new WebSocket(url, ideWsProtocols(jwt));
  ws.binaryType = "arraybuffer";
  const subs = new Set<(m: string) => void>();
  const framer = createLspFramer();
  const outbox: Uint8Array[] = [];

  ws.onopen = () => { for (const f of outbox) ws.send(f); outbox.length = 0; };
  ws.onmessage = (ev) => {
    const bytes = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : new TextEncoder().encode(String(ev.data));
    framer.feed(bytes, (msg) => { for (const h of subs) h(msg); });
  };

  const transport: Transport = {
    send(message) {
      const framed = frameLsp(message);
      if (ws.readyState === WebSocket.OPEN) ws.send(framed);
      else outbox.push(framed);
    },
    subscribe(h) { subs.add(h); },
    unsubscribe(h) { subs.delete(h); },
  };
  return { transport, ws };
}

// One connection per (workspace, server). Dropped when its socket closes or its server
// never initializes, so the next file open dials again — a restarted sandbox self-heals.
interface LspConnection {
  client: LSPClient;
  ws: WebSocket;
  closed: Promise<void>;
}

const connections = new Map<string, LspConnection>();

function dropConnection(key: string, conn: LspConnection): void {
  if (connections.get(key) === conn) connections.delete(key);
  conn.client.disconnect();
  try { conn.ws.close(); } catch { /* already closed */ }
}

function getConnection(serverLang: string, workspaceId: string): { key: string; conn: LspConnection } {
  const key = `${workspaceId}::${serverLang}`;
  const existing = connections.get(key);
  if (existing) return { key, conn: existing };
  const { transport, ws } = connect(serverLang, workspaceId);
  const closed = new Promise<void>((resolve) => {
    ws.addEventListener("close", () => resolve());
    ws.addEventListener("error", () => resolve());
  });
  const client = new LSPClient({
    rootUri: "file:///workspace",
    timeout: LSP_REQUEST_TIMEOUT_MS,
    notificationHandlers: {
      // Tap diagnostics for the Problems panel; return false so the built-in
      // lint extension still drives the in-editor gutter.
      "textDocument/publishDiagnostics": (_c, params) => {
        const p = params as { uri: string; diagnostics?: RawDiagnostic[] };
        useDiagnosticsStore.getState().setForUri(p.uri, (p.diagnostics ?? []).map((d) => mapDiagnostic(p.uri, d)));
        return false;
      },
    },
  }).connect(transport);
  const conn = { client, ws, closed };
  connections.set(key, conn);
  void closed.then(() => { if (connections.get(key) === conn) connections.delete(key); });
  return { key, conn };
}

/**
 * The CodeMirror extension wiring a document to its language server (completion,
 * hover, diagnostics, goto), once that server has initialized. Resolves null when
 * the language has no server, the bridge is unconfigured, or the server is not
 * reachable (e.g. a stopped sandbox). Dynamically imported by CodeFileView so
 * @codemirror/lsp-client never lands in the base editor chunk.
 */
export async function lspExtensionFor(languageId: string, uri: string, workspaceId: string): Promise<Extension | null> {
  const serverLang = lspServerFor(languageId);
  if (!serverLang || !API_BASE || !workspaceId) return null;
  try {
    const { key, conn } = getConnection(serverLang, workspaceId);
    const client = await whenInitialized(conn.client, conn.closed);
    if (!client) {
      dropConnection(key, conn);
      return null;
    }
    return languageServerSupport(client, uri, LSP_DOC_LANG[languageId] ?? languageId);
  } catch {
    return null;
  }
}

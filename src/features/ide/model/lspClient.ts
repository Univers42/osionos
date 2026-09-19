/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   lspClient.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { API_BASE, getActivePageJwt } from "@/shared/api/client";
import { frameLsp, createLspFramer } from "./lspFraming";
import { ideWsProtocols } from "./useIdeTerminal";
import { useDiagnosticsStore, type IdeDiagnostic } from "./diagnosticsStore";
import { LspClient, type LspDiagnostic, type Transport } from "./lspProtocol";
import { LSP_REQUEST_TIMEOUT_MS, whenInitialized } from "./lspReady";

// The browser wiring around lspProtocol.ts: the WebSocket transport to the
// bridge's `/api/ide/lsp?lang=` relay, one connection per (workspace, server),
// and the publishDiagnostics tap into the Problems store. No editor import —
// the Monaco providers live in lspMonaco.ts on top of this.

// IDE languageId → sandbox LSP server key (bridge LSP_SERVERS). Only these have
// a server installed in the sandbox image; anything else → no LSP. clangd
// serves both C and C++.
const LSP_SERVER: Record<string, string> = {
  typescript: "typescript", tsx: "typescript", javascript: "typescript", jsx: "typescript",
  python: "python",
  go: "go",
  rust: "rust",
  c: "clangd", cpp: "clangd",
};
// IDE languageId → the LSP `languageId` the server expects on didOpen.
const LSP_DOC_LANG: Record<string, string> = {
  typescript: "typescript", tsx: "typescriptreact", javascript: "javascript", jsx: "javascriptreact",
  python: "python",
  go: "go",
  rust: "rust",
  c: "c", cpp: "cpp",
};

/** The sandbox LSP server key for an IDE language, or null if none. */
export function lspServerFor(languageId: string): string | null {
  return LSP_SERVER[languageId] ?? null;
}

/** The `languageId` sent on didOpen for an IDE language. */
export function lspDocumentLanguage(languageId: string): string {
  return LSP_DOC_LANG[languageId] ?? languageId;
}

function mapDiagnostic(uri: string, d: LspDiagnostic): IdeDiagnostic {
  return {
    uri,
    severity: typeof d.severity === "number" ? d.severity : 1,
    message: String(d.message ?? ""),
    line: d.range?.start?.line ?? 0,
    character: d.range?.start?.character ?? 0,
    endLine: d.range?.end?.line,
    endCharacter: d.range?.end?.character,
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
  client: LspClient;
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
  const client = new LspClient({
    rootUri: "file:///workspace",
    timeout: LSP_REQUEST_TIMEOUT_MS,
    notificationHandlers: {
      // Diagnostics land in the store; the Problems panel AND the editor's marker
      // layer (lspMonaco) both read from there, so there is one source of truth.
      "textDocument/publishDiagnostics": (params) => {
        const p = params as { uri: string; diagnostics?: LspDiagnostic[] };
        useDiagnosticsStore.getState().setForUri(p.uri, (p.diagnostics ?? []).map((d) => mapDiagnostic(p.uri, d)));
      },
    },
  }).connect(transport);
  const conn = { client, ws, closed };
  connections.set(key, conn);
  void closed.then(() => { if (connections.get(key) === conn) { connections.delete(key); client.disconnect(); } });
  return { key, conn };
}

/**
 * An initialized client for the language's server, or null when the language
 * has no server, the bridge is unconfigured, or the server is not reachable
 * (e.g. a stopped sandbox). Dynamically imported by CodeFileView so none of the
 * LSP layer lands in the base editor chunk.
 */
export async function acquireLspClient(languageId: string, workspaceId: string): Promise<LspClient | null> {
  const serverLang = lspServerFor(languageId);
  if (!serverLang || !API_BASE || !workspaceId) return null;
  try {
    const { key, conn } = getConnection(serverLang, workspaceId);
    const client = await whenInitialized(conn.client, conn.closed);
    if (!client) dropConnection(key, conn);
    return client;
  } catch {
    return null;
  }
}

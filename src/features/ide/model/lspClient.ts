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
import { useDiagnosticsStore, type IdeDiagnostic } from "./diagnosticsStore";

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
  const url = `${wsBase}/api/ide/lsp?token=${encodeURIComponent(jwt)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${serverLang}`;
  const ws = new WebSocket(url);
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

// One LSPClient per (workspace, server). Evicted when its socket closes so the
// next file open reconnects — a stopped/reaped sandbox self-heals.
const clients = new Map<string, LSPClient>();

function getClient(serverLang: string, workspaceId: string): LSPClient {
  const key = `${workspaceId}::${serverLang}`;
  const existing = clients.get(key);
  if (existing) return existing;
  const { transport, ws } = connect(serverLang, workspaceId);
  ws.addEventListener("close", () => clients.delete(key));
  ws.addEventListener("error", () => clients.delete(key));
  const client = new LSPClient({
    rootUri: "file:///workspace",
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
  clients.set(key, client);
  return client;
}

/**
 * The CodeMirror extension wiring a document to its language server (completion,
 * hover, diagnostics, goto). Returns null when the language has no server or the
 * bridge is unconfigured. Dynamically imported by CodeFileView so
 * @codemirror/lsp-client never lands in the base editor chunk.
 */
export function lspExtensionFor(languageId: string, uri: string, workspaceId: string): Extension | null {
  const serverLang = lspServerFor(languageId);
  if (!serverLang || !API_BASE || !workspaceId) return null;
  try {
    const client = getClient(serverLang, workspaceId);
    return languageServerSupport(client, uri, LSP_DOC_LANG[languageId] ?? languageId);
  } catch {
    return null;
  }
}

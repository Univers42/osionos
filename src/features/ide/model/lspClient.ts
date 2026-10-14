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

import { connectFramedIdeSocket } from "./framedIdeSocket";
import { isLspOutOfMemoryClose } from "./wsCloseCodes";
import { useDiagnosticsStore, type IdeDiagnostic } from "./diagnosticsStore";
import { LspClient, type LspDiagnostic } from "./lspProtocol";
import { LSP_REQUEST_TIMEOUT_MS, whenInitialized } from "./lspReady";
import { ideOutput } from "./ideOutputBus";

// The browser wiring around lspProtocol.ts: the WebSocket transport to the
// IDE server's `/api/ide/lsp?lang=` relay, one connection per (workspace, server),
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
  java: "java",
};
// IDE languageId → the LSP `languageId` the server expects on didOpen.
const LSP_DOC_LANG: Record<string, string> = {
  typescript: "typescript", tsx: "typescriptreact", javascript: "javascript", jsx: "javascriptreact",
  python: "python",
  go: "go",
  rust: "rust",
  c: "c", cpp: "cpp",
  java: "java",
};

/** The sandbox LSP server key for an IDE language, or null if none. */
export function lspServerFor(languageId: string): string | null {
  return LSP_SERVER[languageId] ?? null;
}

/** The `languageId` sent on didOpen for an IDE language. */
export function lspDocumentLanguage(languageId: string): string {
  return LSP_DOC_LANG[languageId] ?? languageId;
}

/** Human-readable label for an LSP server key (used in OUTPUT feed messages). */
export function lspServerLabel(serverLang: string): string {
  const labels: Record<string, string> = {
    java: "Java",
    typescript: "TypeScript",
    python: "Python",
    go: "Go",
    rust: "Rust",
    clangd: "C/C++",
  };
  return labels[serverLang] ?? serverLang;
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

/** The LSP relay's own close-code reading: 4137 means the sandbox's language server was
 *  OOM-killed (exit 137), so the OUTPUT feed says why diagnostics stopped. Token expiry
 *  (4011) is common to every IDE socket and lives in framedIdeSocket. */
export function lspSocketCloseHandler(serverLang: string): (code: number) => void {
  return (code) => {
    if (isLspOutOfMemoryClose(code)) ideOutput("lsp", `${lspServerLabel(serverLang)} language server stopped (out of memory)`);
  };
}

// One connection per (workspace, server). Dropped when its socket closes or its server
// never initializes, so the next file open dials again — a restarted sandbox self-heals.
interface LspConnection {
  client: LspClient;
  close: () => void;
  closed: Promise<void>;
}

const connections = new Map<string, LspConnection>();

function dropConnection(key: string, conn: LspConnection): void {
  if (connections.get(key) === conn) connections.delete(key);
  conn.client.disconnect();
  conn.close();
}

function getConnection(serverLang: string, workspaceId: string): { key: string; conn: LspConnection } {
  const key = `${workspaceId}::${serverLang}`;
  const existing = connections.get(key);
  if (existing) return { key, conn: existing };
  const { transport, closed, close } = connectFramedIdeSocket("/api/ide/lsp", { lang: serverLang }, workspaceId, lspSocketCloseHandler(serverLang));
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
  const conn = { client, close, closed };
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
  if (!serverLang || !workspaceId) return null;
  try {
    const { key, conn } = getConnection(serverLang, workspaceId);
    const client = await whenInitialized(conn.client, conn.closed);
    if (!client) dropConnection(key, conn);
    return client;
  } catch {
    return null;
  }
}

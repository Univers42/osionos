/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-lsp-protocol.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { LspClient, type Transport } from "../../src/features/ide/model/lspProtocol.ts";

// The hand-rolled JSON-RPC/LSP client (lspProtocol.ts) replaced the CodeMirror one; it
// carries the same contract the Monaco adapter relies on: ids correlate, notifications
// reach their handler, a server REQUEST is answered (clangd stalls on an unanswered
// workspace/configuration), and disconnecting fails every in-flight request at once.

interface Sent { id?: number; method?: string; params?: unknown; result?: unknown }

function harness(): { transport: Transport; sent: Sent[]; receive(msg: object): void } {
  const subs = new Set<(m: string) => void>();
  const sent: Sent[] = [];
  return {
    sent,
    receive(msg) { for (const h of subs) h(JSON.stringify(msg)); },
    transport: {
      send(message) { sent.push(JSON.parse(message) as Sent); },
      subscribe(h) { subs.add(h); },
      unsubscribe(h) { subs.delete(h); },
    },
  };
}

test("initialize is sent on connect and initialized follows the answer", async () => {
  const h = harness();
  const client = new LspClient({ rootUri: "file:///workspace", timeout: 200 }).connect(h.transport);
  assert.equal(h.sent[0]?.method, "initialize");
  h.receive({ jsonrpc: "2.0", id: h.sent[0]?.id, result: { capabilities: {} } });
  await client.initializing;
  assert.equal(h.sent[1]?.method, "initialized");
});

test("responses are matched to their request id; an error response rejects", async () => {
  const h = harness();
  const client = new LspClient({ timeout: 200 }).connect(h.transport);
  const hover = client.request<{ ok: true }>("textDocument/hover", {});
  const bad = client.request("textDocument/definition", {});
  const [, hoverMsg, badMsg] = h.sent;
  h.receive({ jsonrpc: "2.0", id: badMsg?.id, error: { code: -32601, message: "nope" } });
  h.receive({ jsonrpc: "2.0", id: hoverMsg?.id, result: { ok: true } });
  assert.deepEqual(await hover, { ok: true });
  await assert.rejects(bad, /nope/);
});

test("notifications reach their handler; server requests are answered", () => {
  const h = harness();
  const seen: unknown[] = [];
  new LspClient({ timeout: 200, notificationHandlers: { "textDocument/publishDiagnostics": (p) => seen.push(p) } }).connect(h.transport);
  h.receive({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri: "file:///workspace/a.c", diagnostics: [] } });
  assert.deepEqual(seen, [{ uri: "file:///workspace/a.c", diagnostics: [] }]);
  h.receive({ jsonrpc: "2.0", id: 7, method: "workspace/configuration", params: { items: [{}, {}] } });
  const reply = h.sent.find((m) => m.id === 7 && m.method === undefined);
  assert.deepEqual(reply?.result, [null, null]);
});

test("disconnect fails every in-flight request and refuses new ones", async () => {
  const h = harness();
  const client = new LspClient({ timeout: 5_000 }).connect(h.transport);
  const pending = client.request("textDocument/completion", {});
  client.disconnect();
  await assert.rejects(pending, /disconnected/);
  await assert.rejects(client.request("textDocument/hover", {}), /disconnected/);
  await assert.rejects(client.initializing, /disconnected/);
});

test("a request times out at the configured budget", async () => {
  const h = harness();
  const client = new LspClient({ timeout: 30 }).connect(h.transport);
  await assert.rejects(client.request("textDocument/hover", {}), /timed out/);
});

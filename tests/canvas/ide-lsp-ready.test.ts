/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-lsp-ready.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import { LSPClient, type Transport } from "@codemirror/lsp-client";

import { LSP_REQUEST_TIMEOUT_MS, whenInitialized } from "../../src/features/ide/model/lspReady.ts";

// The IDE opens a language server over the bridge. With the sandbox stopped the bridge
// closes that socket at once, but @codemirror/lsp-client keeps waiting for `initialize`
// until its timeout, then rejects `initializing` — and every notification already chained
// on it became "Uncaught (in promise) Error: Request timed out" in the browser, with the
// dead client cached until the socket closed.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeServer(answer: boolean): Transport {
  const subs = new Set<(m: string) => void>();
  return {
    send(message) {
      const msg = JSON.parse(message) as { id?: number; method?: string };
      if (answer && msg.method === "initialize") {
        queueMicrotask(() => { for (const h of subs) h(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { capabilities: {} } })); });
      }
    },
    subscribe(h) { subs.add(h); },
    unsubscribe(h) { subs.delete(h); },
  };
}

async function unhandledDuring(run: () => Promise<void>): Promise<unknown[]> {
  const seen: unknown[] = [];
  const onUnhandled = (reason: unknown) => { seen.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  try { await run(); } finally { process.off("unhandledRejection", onUnhandled); }
  return seen;
}

test("a server that answers initialize yields the client", async () => {
  const client = new LSPClient({ timeout: 200 }).connect(fakeServer(true));
  assert.equal(await whenInitialized(client, new Promise(() => {})), client);
});

test("a socket that closes gives up at once, without an uncaught error", async () => {
  const client = new LSPClient({ timeout: 40 }).connect(fakeServer(false));
  const unhandled = await unhandledDuring(async () => {
    const started = Date.now();
    assert.equal(await whenInitialized(client, Promise.resolve()), null);
    assert.ok(Date.now() - started < 30, "must not wait for the initialize timeout");
    await sleep(80);
  });
  assert.deepEqual(unhandled, []);
});

test("a server that never answers yields null, without an uncaught error", async () => {
  const client = new LSPClient({ timeout: 40 }).connect(fakeServer(false));
  const unhandled = await unhandledDuring(async () => {
    assert.equal(await whenInitialized(client, new Promise(() => {})), null);
    await sleep(40);
  });
  assert.deepEqual(unhandled, []);
});

test("initialize gets more than the library's 3 s default", () => {
  assert.ok(LSP_REQUEST_TIMEOUT_MS >= 10_000, "a busy machine answered initialize in > 3 s");
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-session-revoked.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * C128: the 401 of a revoked session reaches the store, through the transport the
 * AI client really uses.
 *
 * The transport is the module's own (src/features/ai/api/aiClient.ts:230): the session
 * bearer, wrapped in the revocation check the bridge calls use. The test does NOT
 * swap it (setAiTransport): it stubs `globalThis.fetch` and the user store, and calls
 * the client as the app does — so what is proved is the wiring, not a stub of it.
 */

import assert from "node:assert/strict";
import test from "node:test";

const TOKEN = "osionos_v1.token-A";
const BASE = "https://ai.test";

/** The globals the client reads: the store (token + revoked handler) and the fetch. */
const globals = globalThis as unknown as Record<string, unknown>;

/** The store the client reads its session from, and the handler that ends it. */
function installStore(revoked: string[]): void {
  globals["__playgroundUserStore"] = {
    getState: () => ({
      activePageJwt: () => TOKEN,
      activeJwt: () => TOKEN,
      handleSessionRevoked: (token: string) => {
        revoked.push(token);
      },
    }),
  };
}

/** A fetch that always answers the same answer, and records what it was asked. */
function installFetch(status: number, body: unknown): { urls: string[] } {
  const urls: string[] = [];
  globals["fetch"] = async (url: string) => {
    urls.push(String(url));
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { urls };
}

/** The AI client of a build that has the assistant configured. */
function aiClient(): Promise<typeof import("../../src/features/ai/api/aiClient")> {
  const query = encodeURIComponent(JSON.stringify({ VITE_AI_URL: BASE }));
  return import(`../../src/features/ai/api/aiClient.ts?env=${query}`);
}

test("an AI 401 session_revoked signs the session out, once, with the token that was used", async () => {
  const revoked: string[] = [];
  installStore(revoked);
  installFetch(401, { ok: false, code: "session_revoked", error: { code: "session_revoked" } });
  const { listCommands } = await aiClient();
  await assert.rejects(() => listCommands("chat"), /session_revoked/);
  assert.deepEqual(revoked, [TOKEN], "the handler runs once, with the token of the call");
});

test("a plain 401 does not sign anybody out", async () => {
  const revoked: string[] = [];
  installStore(revoked);
  installFetch(401, { ok: false, code: "unauthorized", error: { code: "unauthorized" } });
  const { listCommands } = await aiClient();
  await assert.rejects(() => listCommands("chat"), /unauthorized/);
  assert.deepEqual(revoked, [], "an expired or malformed token is not a revocation");
});

test("the run and its resume go through the same transport", async () => {
  const revoked: string[] = [];
  installStore(revoked);
  const { urls } = installFetch(401, { ok: false, code: "session_revoked" });
  const { startRun, resumeRun } = await aiClient();
  const run = { runId: "r1", conversationId: "c1", text: "hello" };
  await assert.rejects(() => startRun(run), /session_revoked/);
  assert.deepEqual(revoked, [TOKEN], "the run stream reports the revocation too");
  await assert.rejects(() => resumeRun("r1"), /session_revoked/);
  assert.deepEqual(revoked, [TOKEN, TOKEN], "the resumed stream reports it as well");
  assert.deepEqual(urls, [`${BASE}/api/ai/runs`, `${BASE}/api/ai/runs/r1/events`]);
});

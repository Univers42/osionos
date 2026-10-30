/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-machine-link.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The app's half of the frame contract (C0-F2, C10): it answers the IDE page's ready and
// need-session with a node token, only to the exact IDE origin, and a step-up refusal becomes a
// state the view shows instead of a silent failure.

import assert from "node:assert/strict";
import test from "node:test";

import { linkMachineFrame, type MintResult } from "../../src/features/ide/vscode/machineLink.ts";

const IDE = "https://ide.example:4100";
const TOKEN = "osionos_ide1.eyJleHAiOjF9.c2ln";

function world(results: MintResult[]) {
  const posted: Array<{ message: unknown; origin: string }> = [];
  const states: string[] = [];
  let handler: (event: { data: unknown; origin: string; source: unknown }) => void = () => {};
  const frame = { postMessage: (message: unknown, origin: string) => posted.push({ message, origin }) };
  let mints = 0;
  const link = linkMachineFrame({
    frame: () => frame,
    ideOrigin: IDE,
    listen: (next) => { handler = next; return () => {}; },
    mint: async () => results[Math.min(mints++, results.length - 1)],
    onState: (state) => states.push(state),
  });
  const deliver = (data: unknown, origin = IDE, source: unknown = frame) => handler({ data, origin, source });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { posted, states, deliver, settle, link, mints: () => mints };
}

test("ready gets a node token posted to the exact IDE origin", async () => {
  const w = world([{ kind: "ok", token: TOKEN }]);
  w.deliver({ type: "osionos-ide/ready", node: "laptop" });
  await w.settle();
  assert.deepEqual(w.posted, [{ message: { type: "osionos-ide/session", token: TOKEN }, origin: IDE }]);
});

test("a message from another origin or another window mints nothing", async () => {
  const w = world([{ kind: "ok", token: TOKEN }]);
  w.deliver({ type: "osionos-ide/ready", node: "laptop" }, "https://evil.example");
  w.deliver({ type: "osionos-ide/ready", node: "laptop" }, IDE, {});
  await w.settle();
  assert.equal(w.mints(), 0);
  assert.deepEqual(w.posted, []);
});

test("a step-up refusal is a state; retry after the step-up sends the token", async () => {
  const w = world([{ kind: "step-up" }, { kind: "ok", token: TOKEN }]);
  w.deliver({ type: "osionos-ide/ready", node: "laptop" });
  await w.settle();
  assert.deepEqual(w.posted, []);
  assert.equal(w.states.at(-1), "step-up");
  await w.link.retry();
  assert.equal(w.posted.length, 1);
});

test("the frame's own state reports reach the view", async () => {
  const w = world([{ kind: "ok", token: TOKEN }]);
  w.deliver({ type: "osionos-ide/state", state: "connected" });
  w.deliver({ type: "osionos-ide/state", state: "rooted" });
  await w.settle();
  assert.deepEqual(w.states, ["connected"]);
});

test("the node mint asks for scope node and reads a step-up refusal", async () => {
  const { mintNodeToken } = await import("../../src/features/ide/api/ideToken.ts");
  const sent: Array<{ url: string; body: unknown }> = [];
  const reply = (status: number, body: unknown) => async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(body), { status });
  };
  const app = async () => ({ apiBase: "https://bridge.example", token: "osionos_v1.x" });
  const ok = await mintNodeToken({ fetch: reply(200, { ok: true, token: TOKEN, expiresAt: "2099-01-01T00:00:00Z" }), app }, "ws-1");
  assert.deepEqual(ok, { kind: "ok", token: TOKEN });
  assert.deepEqual(sent[0], { url: "https://bridge.example/api/ide/token", body: { workspaceId: "ws-1", scope: "node" } });
  assert.deepEqual(await mintNodeToken({ fetch: reply(403, { code: "sudo_required" }), app }, "ws-1"), { kind: "step-up" });
  assert.deepEqual(await mintNodeToken({ fetch: reply(403, {}), app }, "ws-1"), { kind: "unavailable", reason: "not-allowed" });
  assert.deepEqual(await mintNodeToken({ fetch: reply(200, {}), app: async () => ({ apiBase: "x", token: null }) }, "ws-1"), { kind: "unavailable", reason: "signed-out" });
});

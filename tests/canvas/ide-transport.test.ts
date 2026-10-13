/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-transport.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { createIdeTransport, createExpiredReconnect, ideWsProtocols } from "../../src/features/ide/api/ideTransport.ts";
import { APP_TOKEN, IDE, WS, fakeEnv, headerOf, type Call, type Handler } from "./ide-token-fixtures.ts";

function transportOver(handler?: Handler, ideBase = IDE) {
  const env = fakeEnv({ handler, ideBase });
  const transport = createIdeTransport(env.source, { fetch: env.deps.fetch, ideBase: () => ideBase });
  const ideCalls = (): Call[] => env.calls.filter((c) => !c.url.endsWith("/api/ide/token"));
  return { env, transport, ideCalls };
}

const mintingHandler = (onIde: (call: Call, nth: number) => Response): Handler => {
  let minted = 0;
  let ide = 0;
  return (call) => {
    if (call.url.endsWith("/api/ide/token")) {
      minted += 1;
      return new Response(JSON.stringify({ ok: true, token: `osionos_ide1.tok-${minted}`, expiresAt: new Date(Date.now() + 9e5).toISOString() }), { status: 200 });
    }
    ide += 1;
    return onIde(call, ide);
  };
};

test("ideFetch sends the IDE token as bearer to the IDE origin", async () => {
  const { transport, ideCalls } = transportOver();
  const result = await transport.ideFetch(WS, "/api/ide/fs", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
  assert.equal(result.kind, "response");
  const [call] = ideCalls();
  assert.equal(call.url, `${IDE}/api/ide/fs`);
  assert.match(headerOf(call, "authorization") ?? "", /^Bearer osionos_ide1\.tok-1$/);
  assert.equal(headerOf(call, "content-type"), "application/json");
  assert.equal(call.init.method, "POST");
});

test("an unavailable token surfaces as unavailable with no IDE request", async () => {
  const { transport, ideCalls } = transportOver(() => new Response("{}", { status: 403 }));
  assert.deepEqual(await transport.ideFetch(WS, "/api/ide/fs", {}), { kind: "unavailable", reason: "not-allowed" });
  assert.equal(ideCalls().length, 0);
});

test("a 401 invalidates once and retries once with a fresh token", async () => {
  const { env, transport, ideCalls } = transportOver(mintingHandler((_c, nth) => new Response("{}", { status: nth === 1 ? 401 : 200 })));
  const result = await transport.ideFetch(WS, "/api/ide/git", { method: "POST" });
  assert.equal(result.kind === "response" && result.response.status, 200);
  assert.equal(env.mints().length, 2);
  assert.deepEqual(ideCalls().map((c) => headerOf(c, "authorization")), ["Bearer osionos_ide1.tok-1", "Bearer osionos_ide1.tok-2"]);
});

test("a second 401 is returned, never looped", async () => {
  const { env, transport, ideCalls } = transportOver(mintingHandler(() => new Response("{}", { status: 401 })));
  const result = await transport.ideFetch(WS, "/api/ide/git", {});
  assert.equal(result.kind === "response" && result.response.status, 401);
  assert.equal(ideCalls().length, 2);
  assert.equal(env.mints().length, 2);
});

test("the app token never appears in any request to the IDE origin", async () => {
  const { env, transport } = transportOver(mintingHandler((_c, nth) => new Response("{}", { status: nth === 1 ? 401 : 200 })));
  await transport.ideFetch(WS, "/api/ide/fs", { method: "POST", body: JSON.stringify({ workspaceId: WS }) });
  await transport.ideSocketTarget(WS, "/api/ide/pty", { term: "0" });
  const toIde = env.calls.filter((c) => c.url.startsWith(IDE));
  assert.ok(toIde.length > 0);
  for (const call of toIde) {
    assert.equal(JSON.stringify([call.url, [...new Headers(call.init.headers)], String(call.init.body ?? "")]).includes(APP_TOKEN), false);
  }
});

test("the socket target is wss for an https base and carries the IDE token in the protocols", async () => {
  const { transport } = transportOver();
  const target = await transport.ideSocketTarget(WS, "/api/ide/pty", { term: "2" });
  assert.equal(target.kind, "ok");
  if (target.kind !== "ok") return;
  const url = new URL(target.url);
  assert.equal(url.protocol, "wss:");
  assert.equal(url.host, "ide.example");
  assert.equal(url.pathname, "/api/ide/pty");
  assert.equal(url.searchParams.get("workspaceId"), WS);
  assert.equal(url.searchParams.get("term"), "2");
  assert.deepEqual(target.protocols, ideWsProtocols("osionos_ide1.tok-1"));
  assert.equal(target.url.includes("osionos_ide1"), false);
});

test("an http base gives a ws target; an unconfigured base is unavailable", async () => {
  const plain = transportOver(undefined, "http://ide.local:9000");
  const target = await plain.transport.ideSocketTarget(WS, "/api/ide/fsync", {});
  assert.equal(target.kind === "ok" && target.url.startsWith("ws://ide.local:9000/api/ide/fsync?"), true);
  const off = transportOver(undefined, "");
  assert.deepEqual(await off.transport.ideSocketTarget(WS, "/api/ide/fsync", {}), { kind: "unavailable", reason: "not-configured" });
});

test("expired-socket reconnect allows one immediate retry until a socket opens", () => {
  const invalidated: string[] = [];
  const guard = createExpiredReconnect((ws) => invalidated.push(ws));
  assert.equal(guard.onExpired(WS), true);
  assert.equal(guard.onExpired(WS), false);
  guard.opened();
  assert.equal(guard.onExpired(WS), true);
  assert.deepEqual(invalidated, [WS, WS]);
});

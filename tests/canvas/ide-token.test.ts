/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-token.test.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { API, APP_TOKEN, IDE, WS, T0, TTL_MS, fakeEnv, headerOf, mintResponse } from "./ide-token-fixtures.ts";
import { deferred } from "./ide-sandbox-health-fixtures.ts";
import { createIdeTokenSource } from "../../src/features/ide/api/ideToken.ts";

test("two concurrent callers share one mint", async () => {
  const gate = deferred<Response>();
  const env = fakeEnv({ handler: () => gate.promise });
  const first = env.source.get(WS);
  const second = env.source.get(WS);
  gate.resolve(mintResponse("osionos_ide1.shared", T0 + TTL_MS));
  assert.deepEqual(await first, { kind: "ok", token: "osionos_ide1.shared" });
  assert.deepEqual(await second, { kind: "ok", token: "osionos_ide1.shared" });
  assert.equal(env.mints().length, 1);
});

test("a token is reused while more than 120 s remain and re-minted at 120 s or less", async () => {
  const env = fakeEnv();
  const first = await env.source.get(WS);
  env.clock.now = T0 + TTL_MS - 120_001; // 120.001 s left
  assert.deepEqual(await env.source.get(WS), first);
  assert.equal(env.mints().length, 1);
  env.clock.now = T0 + TTL_MS - 120_000; // exactly 120 s left
  const second = await env.source.get(WS);
  assert.notDeepEqual(second, first);
  assert.equal(env.mints().length, 2);
});

test("each status maps to its reason", async () => {
  const cases: Array<[number, string]> = [
    [404, "not-configured"],
    [403, "not-allowed"],
    [401, "signed-out"],
    [429, "throttled"],
    [503, "error"],
    [500, "error"],
  ];
  for (const [status, reason] of cases) {
    const env = fakeEnv({ handler: () => new Response("{}", { status }) });
    assert.deepEqual(await env.source.get(WS), { kind: "unavailable", reason }, `status ${status}`);
  }
});

test("a 200 refusal from the allowlist is not-allowed, and an ok:false without that reason is error", async () => {
  const refused = fakeEnv({ handler: () => new Response('{"ok":false,"reason":"not-allowed"}', { status: 200 }) });
  assert.deepEqual(await refused.source.get(WS), { kind: "unavailable", reason: "not-allowed" });
  const other = fakeEnv({ handler: () => new Response('{"ok":false,"reason":"other"}', { status: 200 }) });
  assert.deepEqual(await other.source.get(WS), { kind: "unavailable", reason: "error" });
});

test("a network error, a malformed body and an unparseable expiry are all error", async () => {
  const bodies = [() => Promise.reject(new Error("down")), () => new Response("not json", { status: 200 }), () => new Response('{"ok":true,"token":"t","expiresAt":"nope"}', { status: 200 })];
  for (const handler of bodies) {
    const env = fakeEnv({ handler });
    assert.deepEqual(await env.source.get(WS), { kind: "unavailable", reason: "error" });
  }
});

test("a failed mint is not cached: the next call asks again", async () => {
  let status = 503;
  const env = fakeEnv({ handler: () => (status === 200 ? mintResponse("osionos_ide1.ok", T0 + TTL_MS) : new Response("{}", { status })) });
  assert.deepEqual(await env.source.get(WS), { kind: "unavailable", reason: "error" });
  status = 200;
  assert.deepEqual(await env.source.get(WS), { kind: "ok", token: "osionos_ide1.ok" });
  assert.equal(env.mints().length, 2);
});

test("an empty IDE base is not-configured and sends no request", async () => {
  const env = fakeEnv({ ideBase: "" });
  assert.deepEqual(await env.source.get(WS), { kind: "unavailable", reason: "not-configured" });
  assert.equal(env.calls.length, 0);
});

test("no app token is signed-out and sends no request", async () => {
  const env = fakeEnv({ appToken: null });
  assert.deepEqual(await env.source.get(WS), { kind: "unavailable", reason: "signed-out" });
  assert.equal(env.calls.length, 0);
});

test("the mint carries the app token and goes to API_BASE, never to the IDE origin", async () => {
  const env = fakeEnv();
  await env.source.get(WS);
  const [call] = env.calls;
  assert.equal(call.url, `${API}/api/ide/token`);
  assert.equal(call.init.method, "POST");
  assert.equal(headerOf(call, "authorization"), `Bearer ${APP_TOKEN}`);
  assert.equal(headerOf(call, "content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(call.init.body)), { workspaceId: WS });
  assert.ok(env.calls.every((c) => !c.url.startsWith(IDE)));
});

test("invalidate drops the cache and an in-flight mint cannot repopulate it", async () => {
  const env = fakeEnv();
  await env.source.get(WS);
  env.source.invalidate(WS);
  await env.source.get(WS);
  assert.equal(env.mints().length, 2);

  const gate = deferred<Response>();
  const slow = fakeEnv({ handler: (_c, nth) => (nth === 0 ? gate.promise : mintResponse("osionos_ide1.fresh", T0 + TTL_MS)) });
  const stale = slow.source.get(WS);
  slow.source.invalidate(WS);
  const fresh = await slow.source.get(WS);
  gate.resolve(mintResponse("osionos_ide1.stale", T0 + TTL_MS));
  await stale;
  assert.deepEqual(fresh, { kind: "ok", token: "osionos_ide1.fresh" });
  assert.deepEqual(await slow.source.get(WS), { kind: "ok", token: "osionos_ide1.fresh" });
});

test("tokens are cached per workspace", async () => {
  const env = fakeEnv();
  await env.source.get(WS);
  await env.source.get("22222222-2222-4222-8222-222222222222");
  assert.equal(env.mints().length, 2);
});

test("another app session in the same tab never reuses the first session's IDE token", async () => {
  const env = fakeEnv();
  const session = { token: "app-token-account-a" as string | null };
  const source = createIdeTokenSource({ ...env.deps, app: () => Promise.resolve({ apiBase: API, token: session.token }) });
  const first = await source.get(WS);
  session.token = "app-token-account-b";
  const second = await source.get(WS);
  assert.notDeepEqual(second, first);
  assert.equal(env.mints().length, 2);
  assert.equal(headerOf(env.mints()[1]!, "authorization"), "Bearer app-token-account-b");
  session.token = null;
  assert.deepEqual(await source.get(WS), { kind: "unavailable", reason: "signed-out" });
});

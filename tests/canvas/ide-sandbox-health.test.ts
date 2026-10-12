/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-sandbox-health.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  createHealthCore,
  HEALTH_REASONS,
  stateFromResponse,
  type HealthDeps,
  type HealthSnapshot,
} from "../../src/features/ide/model/sandboxHealthCore.ts";
import { authHeader, deferred, fakeCore } from "./ide-sandbox-health-fixtures.ts";

test("initial snapshot is unknown with no workspace and null timestamps", () => {
  const { core } = fakeCore(() => new Response("{}", { status: 200 }));
  assert.deepEqual(core.snapshot(), { state: "unknown", reason: null, workspaceId: null, checkedAt: null });
});

test("probe adopts the workspace immediately and resets the verdict on change", async () => {
  const { core } = fakeCore(() => new Response(JSON.stringify({ status: "running" }), { status: 200 }));
  const seen: HealthSnapshot[] = [];
  core.subscribe((s) => seen.push(s));
  await core.probe("ws-1");
  assert.equal(core.snapshot().state, "online");
  const checkedBefore = core.snapshot().checkedAt;

  const pending = core.probe("ws-2");
  // Adopted synchronously: workspace switched, verdict reset, listener notified.
  assert.equal(core.snapshot().workspaceId, "ws-2");
  assert.equal(core.snapshot().state, "unknown");
  assert.equal(core.snapshot().reason, null);
  assert.equal(core.snapshot().checkedAt, checkedBefore);
  assert.ok(seen.some((s) => s.workspaceId === "ws-2" && s.state === "unknown" && s.reason === null));

  await pending;
  assert.equal(core.snapshot().state, "online");
  assert.equal(core.snapshot().workspaceId, "ws-2");
});

test("empty apiBase or null jwt yields disabled/notConfigured with no fetch", async () => {
  for (const opts of [{ apiBase: "" }, { jwt: null }]) {
    const { core, calls } = fakeCore(() => new Response("{}", { status: 200 }), opts);
    const state = await core.probe("ws-1");
    assert.equal(state, "disabled");
    assert.equal(core.snapshot().reason, HEALTH_REASONS.notConfigured);
    assert.equal(core.snapshot().workspaceId, "ws-1");
    assert.equal(calls.length, 0);
  }
});

test("stateFromResponse maps every status and body per the bridge contract", () => {
  assert.deepEqual(stateFromResponse(200, { status: "running" }), { state: "online", reason: null });
  assert.deepEqual(stateFromResponse(200, { status: "stopped" }), { state: "stopped", reason: HEALTH_REASONS.stopped });
  assert.deepEqual(stateFromResponse(200, { status: "weird" }), { state: "unavailable", reason: HEALTH_REASONS.unexpected });
  assert.deepEqual(stateFromResponse(200, undefined), { state: "unavailable", reason: HEALTH_REASONS.unexpected });
  assert.deepEqual(stateFromResponse(404, {}), { state: "disabled", reason: HEALTH_REASONS.disabled });
  assert.deepEqual(stateFromResponse(401, {}), { state: "disabled", reason: HEALTH_REASONS.forbidden });
  assert.deepEqual(stateFromResponse(403, {}), { state: "disabled", reason: HEALTH_REASONS.forbidden });
  assert.deepEqual(stateFromResponse(429, {}), { state: "keep", reason: null });
  assert.deepEqual(stateFromResponse(502, {}), { state: "unavailable", reason: "Sandbox backend unavailable (HTTP 502)." });
  assert.deepEqual(stateFromResponse(500, {}), { state: "unavailable", reason: "Sandbox backend unavailable (HTTP 500)." });
  assert.deepEqual(stateFromResponse(418, {}), { state: "unavailable", reason: "Unexpected sandbox response (HTTP 418)." });
});

test("a 429 keep leaves the verdict but still stamps checkedAt", async () => {
  let clock = 1000;
  let status = 200;
  const { core } = fakeCore(() => new Response(JSON.stringify({ status: "running" }), { status }), { now: () => clock });
  await core.probe("ws-1");
  assert.equal(core.snapshot().state, "online");
  const firstChecked = core.snapshot().checkedAt;

  clock = 9000;
  status = 429;
  const state = await core.probe("ws-1");
  assert.equal(state, "online");
  assert.equal(core.snapshot().state, "online");
  assert.equal(core.snapshot().reason, null);
  assert.equal(core.snapshot().checkedAt, 9000);
  assert.notEqual(core.snapshot().checkedAt, firstChecked);
});

test("a rejecting fetch yields unavailable/unreachable", async () => {
  const { core } = fakeCore(() => {
    throw new Error("network down");
  });
  const state = await core.probe("ws-1");
  assert.equal(state, "unavailable");
  assert.equal(core.snapshot().reason, HEALTH_REASONS.unreachable);
});

test("checkedAt is stamped with now() after a settled probe and ensure", async () => {
  let clock = 1000;
  const { core } = fakeCore(() => new Response(JSON.stringify({ status: "stopped" }), { status: 200 }), { now: () => clock });
  await core.probe("ws-1");
  assert.equal(core.snapshot().checkedAt, 1000);

  clock = 2000;
  await core.ensure("ws-1"); // POST 2xx → re-probe → stopped
  assert.equal(core.snapshot().checkedAt, 2000);
  assert.equal(core.snapshot().state, "stopped");
});

test("concurrent probes for one workspace share a single fetch and the same promise", async () => {
  const { core, calls } = fakeCore(() => new Response(JSON.stringify({ status: "running" }), { status: 200 }));
  const p1 = core.probe("ws-1");
  const p2 = core.probe("ws-1");
  assert.equal(p1, p2);
  const [s1, s2] = await Promise.all([p1, p2]);
  assert.equal(s1, "online");
  assert.equal(s2, "online");
  assert.equal(calls.length, 1);
});

test("a stale probe result is dropped in favour of the current workspace", async () => {
  const gateA = deferred<Response>();
  const gateB = deferred<Response>();
  let call = 0;
  const { core } = fakeCore(() => {
    call += 1;
    return call === 1 ? gateA.promise : gateB.promise;
  });
  const pA = core.probe("ws-A"); // slow
  const pB = core.probe("ws-B"); // fast

  gateB.resolve(new Response(JSON.stringify({ status: "running" }), { status: 200 }));
  await pB;
  assert.equal(core.snapshot().workspaceId, "ws-B");
  assert.equal(core.snapshot().state, "online");

  // A settles last with a different verdict — it must be dropped.
  gateA.resolve(new Response(JSON.stringify({ status: "stopped" }), { status: 200 }));
  const stateA = await pA;
  assert.equal(core.snapshot().state, "online");
  assert.equal(stateA, "online");
});

test("ensure POSTs the workspace and, on 2xx, re-probes with headers and body", async () => {
  const { core, calls } = fakeCore((url, init) => {
    if (init.method === "POST") return new Response("{}", { status: 200 });
    return new Response(JSON.stringify({ status: "running" }), { status: 200 });
  });
  const state = await core.ensure("ws-1");
  assert.equal(state, "online");
  assert.equal(calls.length, 2);

  const post = calls[0];
  assert.equal(post.url, "https://api.example.com/api/ide/session");
  assert.equal(post.init.method, "POST");
  assert.equal(post.init.body, JSON.stringify({ workspaceId: "ws-1" }));
  assert.equal((post.init.headers as Record<string, string>)["Content-Type"], "application/json");
  assert.equal(authHeader(post), "Bearer token-123");

  const get = calls[1];
  assert.equal(get.url, "https://api.example.com/api/ide/session?workspaceId=ws-1");
  assert.equal(authHeader(get), "Bearer token-123");
});

test("ensure on a non-2xx POST applies the response without probing", async () => {
  const { core, calls } = fakeCore(() => new Response("{}", { status: 404 }));
  const state = await core.ensure("ws-1");
  assert.equal(state, "disabled");
  assert.equal(core.snapshot().reason, HEALTH_REASONS.disabled);
  assert.equal(calls.length, 1);
});

test("a rejecting ensure POST yields unavailable/unreachable", async () => {
  const { core, calls } = fakeCore(() => {
    throw new Error("down");
  });
  const state = await core.ensure("ws-1");
  assert.equal(state, "unavailable");
  assert.equal(core.snapshot().reason, HEALTH_REASONS.unreachable);
  assert.equal(calls.length, 1);
});

test("retry with no workspace resolves the current state without fetching", async () => {
  const { core, calls } = fakeCore(() => new Response(JSON.stringify({ status: "running" }), { status: 200 }));
  const state = await core.retry();
  assert.equal(state, "unknown");
  assert.equal(calls.length, 0);
});

test("retry on a stopped sandbox ensures and ends online (GET, POST, GET)", async () => {
  let getCount = 0;
  const { core, calls } = fakeCore((url, init) => {
    if (init.method === "POST") return new Response("{}", { status: 200 });
    getCount += 1;
    return new Response(JSON.stringify({ status: getCount <= 2 ? "stopped" : "running" }), { status: 200 });
  });
  await core.probe("ws-1"); // GET → stopped, sets workspaceId
  assert.equal(core.snapshot().state, "stopped");

  calls.length = 0; // isolate the retry's own fetches
  const state = await core.retry(); // GET stopped → POST → GET running
  assert.equal(state, "online");
  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /workspaceId=ws-1$/);
  assert.equal(calls[1].init.method, "POST");
  assert.match(calls[2].url, /workspaceId=ws-1$/);
});

test("markClosed maps close codes, falls back on blank reasons, and ignores unknown codes", () => {
  const { core } = fakeCore(() => new Response("{}", { status: 200 }));
  core.markClosed(4004, "daemon down");
  assert.equal(core.snapshot().state, "unavailable");
  assert.equal(core.snapshot().reason, "daemon down");

  core.markClosed(4003, "gate off");
  assert.equal(core.snapshot().state, "disabled");
  assert.equal(core.snapshot().reason, "gate off");

  core.markClosed(4004, "");
  assert.equal(core.snapshot().state, "unavailable");
  assert.equal(core.snapshot().reason, HEALTH_REASONS.closedUnavailable);

  core.markClosed(4003, "   ");
  assert.equal(core.snapshot().state, "disabled");
  assert.equal(core.snapshot().reason, HEALTH_REASONS.closedDisabled);

  // 1006 (abnormal closure) says nothing about sandbox health → no change.
  const before = core.snapshot();
  core.markClosed(1006, "abnormal");
  assert.deepEqual(core.snapshot(), before);
});

test("listeners get a fresh snapshot, can unsubscribe, and a thrower is isolated", () => {
  const { core } = fakeCore(() => new Response(JSON.stringify({ status: "running" }), { status: 200 }));
  const seen: HealthSnapshot[] = [];
  const unsubThrow = core.subscribe(() => {
    throw new Error("boom");
  });
  const unsub = core.subscribe((s) => seen.push(s));

  core.markClosed(4004, "down");
  unsubThrow();
  core.markClosed(4003, "off");
  unsub();
  core.markClosed(4001, "auth");

  assert.equal(seen.length, 2);
  assert.notEqual(seen[0], seen[1]);
  assert.equal(seen[0].state, "unavailable");
  assert.equal(seen[1].state, "disabled");
});

test("probe encodes the workspaceId and sends the bearer header", async () => {
  const { core, calls } = fakeCore(() => new Response(JSON.stringify({ status: "running" }), { status: 200 }));
  await core.probe("ws/1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.example.com/api/ide/session?workspaceId=ws%2F1");
  assert.equal(authHeader(calls[0]), "Bearer token-123");
});

test("a signed-out probe does not pin its verdict: the next probe after sign-in fetches", async () => {
  let token: string | null = null;
  let fetches = 0;
  const deps: HealthDeps = {
    fetch: () => {
      fetches++;
      return Promise.resolve(new Response('{"ok":true,"status":"running"}', { status: 200 }));
    },
    apiBase: () => "https://api.example.com",
    jwt: () => token,
    now: () => 1000,
  };
  const core = createHealthCore(deps);
  assert.equal(await core.probe("ws-1"), "disabled");
  token = "token-123";
  assert.equal(await core.probe("ws-1"), "online");
  assert.equal(fetches, 1);
});

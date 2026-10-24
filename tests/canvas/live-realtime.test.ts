/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-realtime.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LiveRealtime,
  resolveLiveRealtimeToken,
  type LiveRealtimeDeps,
} from "../../src/shared/notion-database-sys/src/store/live/liveRealtime.ts";
import {
  clearLiveEchoRegistry,
  noteLiveOwnWrite,
} from "../../src/shared/notion-database-sys/src/store/live/liveEchoRegistry.ts";
import type {
  LiveRealtimeEventFrame,
  LiveSocketOptions,
} from "../../src/shared/notion-database-sys/src/store/live/liveRealtimeSocket.ts";
import type { ChangeEvent, Page } from "../../src/shared/notion-database-sys/src/component/types.ts";

const frame = (event_type: string, payload: unknown): LiveRealtimeEventFrame => ({
  event_id: "e1", topic: "table:db-1:orders", event_type,
  sequence: 1, timestamp: "2026-06-10T00:00:00Z", payload,
});
const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

function makeOrchestrator(overrides: Partial<LiveRealtimeDeps> = {}) {
  clearLiveEchoRegistry();
  const harness = {
    emitted: [] as ChangeEvent[],
    getPageCalls: [] as string[],
    fetchCount: 0,
    busted: 0,
    socketOpts: null as LiveSocketOptions | null,
    socketsCreated: 0,
    rows: [{ id: 1, name: "A" }] as Record<string, unknown>[],
    page: {
      id: "baas:db-1:orders:7",
      databaseId: "baas:db-1:orders",
      properties: { name: "Remote" },
    } as unknown as Page | null,
    realtime: null as unknown as LiveRealtime,
  };
  harness.realtime = new LiveRealtime({
    databaseId: "baas:db-1:orders",
    getPage: async (pk) => { harness.getPageCalls.push(pk); return harness.page; },
    fetchFirstPage: async () => { harness.fetchCount += 1; return harness.rows; },
    pendingWrites: () => 0,
    emit: (event) => harness.emitted.push(event),
    onSchemaChanged: () => { harness.busted += 1; },
    token: "jwt-token",
    socketUrl: "ws://kong/realtime/v1/ws",
    createSocket: (opts) => {
      harness.socketOpts = opts;
      harness.socketsCreated += 1;
      return { start: () => {}, stop: () => {} };
    },
    coalesceMs: 1,
    ...overrides,
  });
  return harness;
}

test("row_changed with a pk does a targeted get and emits page-changed", async () => {
  const h = makeOrchestrator();
  h.realtime.start();
  assert.equal(h.socketOpts?.topic, "table:db-1:orders");
  h.socketOpts?.onEvent(frame("row_changed", { dbId: "db-1", table: "orders", op: "update", pk: 7 }));
  await tick();
  assert.deepEqual(h.getPageCalls, ["7"]);
  assert.deepEqual(h.emitted, [{
    type: "page-changed",
    pageId: "baas:db-1:orders:7",
    changes: { name: "Remote" },
    databaseId: "baas:db-1:orders",
  }]);
  h.realtime.stop();
});

test("op=delete emits page-deleted directly (no fetch); a vanished get too", async () => {
  const h = makeOrchestrator();
  h.realtime.start();
  h.socketOpts?.onEvent(frame("row_changed", { op: "delete", pk: 7 }));
  await tick();
  assert.equal(h.getPageCalls.length, 0);
  assert.deepEqual(h.emitted, [{ type: "page-deleted", pageId: "baas:db-1:orders:7", databaseId: "baas:db-1:orders" }]);
  h.page = null; // now an update whose row is already gone server-side
  h.socketOpts?.onEvent(frame("row_changed", { op: "update", pk: 9 }));
  await tick();
  assert.deepEqual(h.emitted[1], { type: "page-deleted", pageId: "baas:db-1:orders:9", databaseId: "baas:db-1:orders" });
  h.realtime.stop();
});

test("op=insert emits page-inserted with the fetched page", async () => {
  const h = makeOrchestrator();
  h.realtime.start();
  h.socketOpts?.onEvent(frame("row_changed", { op: "insert", pk: 7 }));
  await tick();
  assert.deepEqual(h.emitted, [{ type: "page-inserted", page: h.page }]);
  h.realtime.stop();
});

test("schema_changed busts the schema cache then reloads state", async () => {
  const h = makeOrchestrator();
  h.realtime.start();
  h.socketOpts?.onEvent(frame("schema_changed", { dbId: "db-1", table: "orders", op: "add_column" }));
  await tick();
  assert.equal(h.busted, 1);
  assert.deepEqual(h.emitted, [{ type: "state-replaced" }]);
  h.realtime.stop();
});

test("echoes of our own recent writes are dropped (table:pk registry)", async () => {
  const h = makeOrchestrator();
  h.realtime.start();
  noteLiveOwnWrite("db-1", "orders", "7"); // what the write pipeline records at send time
  h.socketOpts?.onEvent(frame("row_changed", { op: "update", pk: 7 }));
  await tick();
  assert.equal(h.getPageCalls.length, 0);
  assert.equal(h.emitted.length, 0);
  h.socketOpts?.onEvent(frame("row_changed", { op: "update", pk: 8 })); // another row passes
  await tick();
  assert.deepEqual(h.getPageCalls, ["8"]);
  h.realtime.stop();
});

test("no token → no socket, poll-only fallback emits on real change", async () => {
  const h = makeOrchestrator({ token: null, pollIntervalMs: 5 });
  h.realtime.start();
  assert.equal(h.socketsCreated, 0);
  h.realtime.noteBaseline([{ id: 1, name: "A" }], ["id"]);
  h.rows = [{ id: 1, name: "CHANGED" }];
  await tick(25);
  assert.ok(h.fetchCount > 0);
  assert.deepEqual(h.emitted, [{ type: "state-replaced" }]); // once — baseline then converged
  h.realtime.stop();
});

test("with no token and a registered factory it opens exactly one socket through it", () => {
  const calls: Array<{ url: string; topic: string }> = [];
  let started = 0;
  const global = globalThis as Record<string, unknown>;
  global.__osionosTopicSocket = (options: { url: string; topic: string }) => {
    calls.push({ url: options.url, topic: options.topic });
    return { start: () => { started += 1; }, stop: () => undefined };
  };
  try {
    const h = makeOrchestrator({ token: undefined });
    h.realtime.start();
    assert.equal(calls.length, 1, "one socket, opened through the factory");
    assert.equal(calls[0].topic, "table:db-1:orders");
    assert.equal(calls[0].url, "ws://kong/realtime/v1/ws");
    assert.equal(started, 1, "the socket the factory handed over is started");
    assert.equal(h.socketsCreated, 0, "the direct socket is not used");
    h.realtime.stop();
  } finally {
    delete global.__osionosTopicSocket;
  }
});

test("with neither a token nor a factory it opens no socket and keeps polling", async () => {
  const global = globalThis as Record<string, unknown>;
  delete global.__osionosTopicSocket;
  const h = makeOrchestrator({ token: undefined, pollIntervalMs: 5 });
  h.realtime.start();
  assert.equal(h.socketsCreated, 0);
  h.realtime.noteBaseline([{ id: 1, name: "A" }], ["id"]);
  h.rows = [{ id: 1, name: "CHANGED" }];
  await tick(25);
  assert.ok(h.fetchCount > 0, "the poll still covers the database");
  h.realtime.stop();
});

test("resolveLiveRealtimeToken refuses a bridge session jwt but keeps another jwt", () => {
  const global = globalThis as Record<string, unknown>;
  const jwt = (iss: string) => `v1.${Buffer.from(JSON.stringify({ iss, sub: "user-1" })).toString("base64url")}.sig`;
  try {
    global.__playgroundUserStore = { getState: () => ({ activePageJwt: () => jwt("osionos-bridge") }) };
    assert.equal(resolveLiveRealtimeToken(), null, "the gateway would answer AUTH_FAILED");
    global.__playgroundUserStore = { getState: () => ({ activePageJwt: () => jwt("other-issuer") }) };
    assert.equal(resolveLiveRealtimeToken(), `v1.${Buffer.from(JSON.stringify({ iss: "other-issuer", sub: "user-1" })).toString("base64url")}.sig`);
  } finally {
    delete global.__playgroundUserStore;
  }
});

test("pk-less events coalesce into one refresh; equal hash emits nothing", async () => {
  const h = makeOrchestrator();
  h.realtime.start();
  h.realtime.noteBaseline([{ id: 1, name: "A" }], ["id"]);
  h.socketOpts?.onEvent(frame("row_changed", { op: "update", filter: { qty: { gt: 1 } } }));
  h.socketOpts?.onEvent(frame("row_changed", { op: "update" })); // same window
  await tick(20);
  assert.equal(h.fetchCount, 1); // coalesced
  assert.equal(h.emitted.length, 0); // first page identical → suppressed
  h.rows = [{ id: 1, name: "B" }];
  h.socketOpts?.onEvent(frame("row_changed", { op: "delete" }));
  await tick(20);
  assert.deepEqual(h.emitted, [{ type: "state-replaced" }]);
  h.realtime.stop();
});

test("reconnect after a drop schedules a catch-up refresh", async () => {
  const h = makeOrchestrator();
  h.realtime.start();
  h.socketOpts?.onUp?.(); // first connect: no refresh needed
  await tick(20);
  assert.equal(h.fetchCount, 0);
  h.socketOpts?.onDown?.();
  h.socketOpts?.onUp?.(); // recovery → catch events missed while down
  await tick(20);
  assert.equal(h.fetchCount, 1);
  h.realtime.stop();
});

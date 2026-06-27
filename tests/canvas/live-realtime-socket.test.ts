/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-realtime-socket.test.ts                        :+:      :+:    :+:   */
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
  LiveRealtimeSocket,
  type LiveRealtimeEventFrame,
  type LiveSocketOptions,
  type LiveWebSocketLike,
} from "../../src/shared/notion-database-sys/src/store/live/liveRealtimeSocket.ts";

/** Hand-driven WebSocket double: tests open/message/drop the wire explicitly. */
class FakeWebSocket implements LiveWebSocketLike {
  static instances: FakeWebSocket[] = [];
  url: string;
  sent: string[] = [];
  closed: (number | undefined)[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) { this.url = url; FakeWebSocket.instances.push(this); }
  send(data: string): void { this.sent.push(data); }
  close(code?: number): void { this.closed.push(code); this.onclose?.(); }
  open(): void { this.onopen?.(); }
  message(frame: Record<string, unknown>): void { this.onmessage?.({ data: JSON.stringify(frame) }); }
  drop(): void { this.onclose?.(); } // server-side close (no client close call)
  frames(): Record<string, unknown>[] { return this.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>); }
}

const AUTH_OK = { type: "AUTH_OK", conn_id: "c1", server_time: "2026-06-10T00:00:00Z" };
const SUBSCRIBED = { type: "SUBSCRIBED", sub_id: "live-mount", seq: 0 };
const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

function makeSocket(overrides: Partial<LiveSocketOptions> = {}) {
  FakeWebSocket.instances = [];
  const events: LiveRealtimeEventFrame[] = [];
  const status: string[] = [];
  const socket = new LiveRealtimeSocket({
    url: "ws://kong/realtime/v1/ws",
    token: "jwt-token",
    topic: "table:db-1:orders",
    onEvent: (event) => events.push(event),
    onUp: () => status.push("up"),
    onDown: () => status.push("down"),
    onPermanentFailure: (reason) => status.push(`permanent:${reason}`),
    webSocketCtor: FakeWebSocket,
    minBackoffMs: 1,
    maxBackoffMs: 4,
    ...overrides,
  });
  return { socket, events, status };
}

test("AUTH is the first frame; SUBSCRIBE is sent only after AUTH_OK", () => {
  const { socket } = makeSocket();
  socket.start();
  const ws = FakeWebSocket.instances[0];
  ws.open();
  assert.deepEqual(ws.frames(), [{ type: "AUTH", token: "jwt-token" }]); // nothing else yet
  ws.message(AUTH_OK);
  assert.deepEqual(ws.frames()[1], { type: "SUBSCRIBE", sub_id: "live-mount", topic: "table:db-1:orders" });
  socket.stop();
});

test("EVENT frames are parsed and delivered; SUBSCRIBED reports up", () => {
  const { socket, events, status } = makeSocket();
  socket.start();
  const ws = FakeWebSocket.instances[0];
  ws.open();
  ws.message(AUTH_OK);
  ws.message(SUBSCRIBED);
  assert.deepEqual(status, ["up"]);
  ws.message({
    type: "EVENT",
    sub_id: "live-mount",
    event: {
      event_id: "e1", topic: "table:db-1:orders", event_type: "row_changed",
      sequence: 3, timestamp: "2026-06-10T00:00:01Z",
      payload: { dbId: "db-1", table: "orders", op: "update", pk: 7 },
    },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, "row_changed");
  assert.equal((events[0].payload as { pk?: number }).pk, 7);
  socket.stop();
});

test("auth failure allows exactly one retry, then gives up permanently", async () => {
  const { socket, status } = makeSocket();
  socket.start();
  const first = FakeWebSocket.instances[0];
  first.open();
  first.message({ type: "ERROR", code: "AUTH_FAILED", message: "bad signature" });
  first.drop(); // the gateway closes right after the error frame
  await tick();
  assert.equal(FakeWebSocket.instances.length, 2); // the single allowed retry
  const second = FakeWebSocket.instances[1];
  second.open();
  second.message({ type: "ERROR", code: "AUTH_FAILED", message: "bad signature" });
  second.drop();
  await tick(25);
  assert.equal(FakeWebSocket.instances.length, 2); // NO reconnect loop
  assert.ok(status.includes("permanent:auth failed"));
  socket.stop();
});

test("non-auth drop reconnects with backoff and re-authenticates", async () => {
  const { socket, status } = makeSocket();
  socket.start();
  const first = FakeWebSocket.instances[0];
  first.open();
  first.message(AUTH_OK);
  first.message(SUBSCRIBED);
  first.drop(); // network blip
  assert.deepEqual(status, ["up", "down"]);
  await tick();
  assert.equal(FakeWebSocket.instances.length, 2);
  const second = FakeWebSocket.instances[1];
  second.open();
  assert.deepEqual(second.frames()[0], { type: "AUTH", token: "jwt-token" });
  socket.stop();
});

test("a silent socket past the idle timeout is force-closed, then reconnects", async () => {
  const { socket } = makeSocket({ pingIntervalMs: 2, idleTimeoutMs: 5 });
  socket.start();
  const ws = FakeWebSocket.instances[0];
  ws.open();
  ws.message(AUTH_OK); // last sign of life
  await tick(30); // several heartbeat intervals with no inbound frames
  assert.ok(ws.closed.length >= 1); // idle close
  assert.ok(FakeWebSocket.instances.length >= 2); // reconnect attempted
  socket.stop();
});

test("stop() closes cleanly (1000) and never reconnects", async () => {
  const { socket } = makeSocket();
  socket.start();
  const ws = FakeWebSocket.instances[0];
  ws.open();
  ws.message(AUTH_OK);
  ws.message(SUBSCRIBED);
  socket.stop();
  assert.deepEqual(ws.closed, [1000]);
  await tick(25);
  assert.equal(FakeWebSocket.instances.length, 1); // no respawn after stop
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-transport.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Phase-0 (AOC §13) multi-client transport test. Two GrobaseRealtimeTransport
 * instances bind over ONE in-memory gateway double that mirrors the verified
 * realtime-core/protocol.rs framing (AUTH→AUTH_OK, SUBSCRIBE→SUBSCRIBED,
 * BROADCAST→EVENT fan-out, TRACK→PRESENCE). No live gateway needed — this proves
 * the port contract + the synthesized request/reply + R-A1 (no mouse variant).
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { LiveWebSocketLike } from "../../src/shared/notion-database-sys/src/store/live/liveRealtimeSocket.ts";
import type { CollabEvent } from "../../src/features/collab/model/realtimeTransport.port.ts";
import { validateCollabEvent } from "../../src/features/collab/model/collabEvent.schema.ts";
import { GrobaseRealtimeTransport } from "../../src/features/collab/api/realtimeTransportGrobase.adapter.ts";

// ── In-memory gateway double (mirrors protocol.rs handle_* fan-out) ───────────
class FakeGateway {
  private readonly byTopic = new Map<string, Set<FakeSocket>>();
  private readonly meta = new Map<FakeSocket, unknown>();

  subscribe(topic: string, socket: FakeSocket): void {
    const set = this.byTopic.get(topic) ?? new Set<FakeSocket>();
    set.add(socket);
    this.byTopic.set(topic, set);
  }

  broadcast(topic: string, event: unknown, payload: unknown): void {
    const frame = JSON.stringify({
      type: "EVENT",
      event: { event_id: "e", topic, event_type: "broadcast", sequence: 1, timestamp: "t", payload: { event, payload } },
    });
    for (const socket of this.byTopic.get(topic) ?? []) socket.deliver(frame);
  }

  track(topic: string, socket: FakeSocket, meta: unknown): void {
    this.meta.set(socket, meta);
    const members = [...(this.byTopic.get(topic) ?? [])]
      .map((sock) => ({ conn_id: "c", meta: this.meta.get(sock) }))
      .filter((member) => member.meta !== undefined);
    const frame = JSON.stringify({ type: "PRESENCE", topic, members });
    for (const socket2 of this.byTopic.get(topic) ?? []) socket2.deliver(frame);
  }
}

class FakeSocket implements LiveWebSocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  private readonly gateway: FakeGateway;

  constructor(gateway: FakeGateway) {
    this.gateway = gateway;
    queueMicrotask(() => this.onopen?.()); // open fires after the caller wires handlers
  }

  send(data: string): void {
    const frame = JSON.parse(data) as { type: string; topic?: string; event?: unknown; payload?: unknown; meta?: unknown; sub_id?: string };
    queueMicrotask(() => {
      if (frame.type === "AUTH") this.deliver(JSON.stringify({ type: "AUTH_OK", conn_id: "c", server_time: 0 }));
      else if (frame.type === "SUBSCRIBE" && frame.topic) {
        this.gateway.subscribe(frame.topic, this);
        this.deliver(JSON.stringify({ type: "SUBSCRIBED", sub_id: frame.sub_id, seq: 0 }));
      } else if (frame.type === "BROADCAST" && frame.topic) this.gateway.broadcast(frame.topic, frame.event, frame.payload);
      else if (frame.type === "TRACK" && frame.topic) this.gateway.track(frame.topic, this, frame.meta);
    });
  }

  deliver(data: string): void { queueMicrotask(() => this.onmessage?.({ data })); }
  close(): void { this.onclose?.(); }
}

function gatewayCtor(gateway: FakeGateway) {
  return class extends FakeSocket { constructor(_url: string) { super(gateway); } } as unknown as new (url: string) => LiveWebSocketLike;
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function joinTwo(requestTimeoutMs?: number) {
  const gateway = new FakeGateway();
  const ctor = gatewayCtor(gateway);
  const a = new GrobaseRealtimeTransport({ url: "ws://test", selfId: "A", webSocketCtor: ctor, requestTimeoutMs });
  const b = new GrobaseRealtimeTransport({ url: "ws://test", selfId: "B", webSocketCtor: ctor, requestTimeoutMs });
  const chA = await a.join("demo", "token-A");
  const chB = await b.join("demo", "token-B");
  return { chA, chB };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
test("two clients exchange exactly one validated CollabEvent over the adapter", async () => {
  const { chA, chB } = await joinTwo();
  const received: CollabEvent[] = [];
  chB.onEvent((event) => received.push(event));

  const caret: CollabEvent = { t: "caret", actor: "A", seq: 1, caret: { blockId: "b1", offset: 3 } };
  chA.broadcast(caret);
  await flush();

  assert.equal(received.length, 1, "B receives exactly one event");
  assert.deepEqual(received[0], caret, "the CollabEvent round-trips intact");
  assert.ok(validateCollabEvent(received[0]), "the delivered event passes boundary validation");
  chA.leave(); chB.leave();
});

test("synthesized request/reply: an accepted summon resolves to { accepted: true }", async () => {
  const { chA, chB } = await joinTwo();
  chB.onRequest(async (from, req) => {
    assert.equal(from, "A");
    assert.equal(req.kind, "summon");
    assert.equal(req.route, "/page/x");
    return { accepted: true };
  });

  const result = await chA.request("B", { kind: "summon", route: "/page/x", message: "come here" });
  assert.deepEqual(result, { accepted: true });
  chA.leave(); chB.leave();
});

test("a request to a non-targeted member is ignored and times out declined (directed, not all)", async () => {
  const { chA, chB } = await joinTwo(30); // short timeout so the unanswered branch resolves fast
  let handled = false;
  chB.onRequest(async () => { handled = true; return { accepted: true }; });
  // Address a member that is not B; B must not handle it, and A times out → declined.
  const result = await chA.request("NOBODY", { kind: "summon", route: "/x" });
  assert.equal(handled, false, "B does not handle a request addressed to someone else");
  assert.equal(result.accepted, false, "an unanswered summon resolves declined");
  chA.leave(); chB.leave();
});

test("validateCollabEvent accepts every variant and rejects malformed + mouse (R-A1)", () => {
  assert.ok(validateCollabEvent({ t: "caret", actor: "A", seq: 1, caret: { blockId: "b", offset: 0 } }));
  assert.ok(validateCollabEvent({ t: "selection", actor: "A", seq: 1, range: null }));
  assert.ok(validateCollabEvent({ t: "focus", actor: "A", seq: 1, elementId: "btn-1" }));
  assert.ok(validateCollabEvent({ t: "activity", actor: "A", seq: 1, kind: "clicked", targetId: "x" }));
  assert.ok(validateCollabEvent({ t: "nav", actor: "A", seq: 1, route: "/p" }));
  assert.ok(validateCollabEvent({ t: "note", actor: "A", noteId: "n1", op: "created", anchor: { blockId: "b" } }));
  assert.ok(validateCollabEvent({ t: "file", actor: "A", fileId: "f1", op: "seeded", name: "x.pdf" }));

  assert.equal(validateCollabEvent({ t: "mouse", actor: "A", seq: 1 }), null, "no mouse variant exists (R-A1)");
  assert.equal(validateCollabEvent({ t: "caret", actor: "A" }), null, "missing required fields → dropped");
  assert.equal(validateCollabEvent({ t: "activity", actor: "A", seq: 1, kind: "evil", targetId: "x" }), null);
  assert.equal(validateCollabEvent(null), null);
});

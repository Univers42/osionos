/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   topic-fan-out.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #172: the gateway does not replay what it sent while a socket was down, and nothing
// told a listener its subscription had come back — so a chat, a thread or the inbox
// silently missed every event of the gap until a reload.

import assert from "node:assert/strict";
import test from "node:test";

import { createTopicFanOut, type TopicSocketHandlers } from "../../src/services/realtime-messages/topicFanOut.ts";
import type { LiveRealtimeEventFrame } from "../../src/shared/notion-database-sys/src/store/live/liveRealtimeSocket.ts";

const frame = (id: string): LiveRealtimeEventFrame => ({
  event_id: id, topic: "chat:ws:chan", event_type: "message_created", sequence: 1, timestamp: "", payload: { messageId: id },
});

/** A fan-out over fake sockets: `sockets` holds each one's handlers and whether it was stopped. */
function setup() {
  const sockets: { handlers: TopicSocketHandlers; stopped: boolean }[] = [];
  const subscribe = createTopicFanOut();
  const open = (handlers: TopicSocketHandlers) => {
    const socket = { handlers, stopped: false };
    sockets.push(socket);
    return { stop: () => { socket.stopped = true; } };
  };
  return { sockets, subscribe, open };
}

test("listeners of one topic share one socket and each gets every event", () => {
  const { sockets, subscribe, open } = setup();
  const seen: string[] = [];
  subscribe("chat:ws:chan", open, { onEvent: (event) => seen.push(`a:${event.event_id}`) });
  subscribe("chat:ws:chan", open, { onEvent: (event) => seen.push(`b:${event.event_id}`) });
  assert.equal(sockets.length, 1);
  sockets[0].handlers.onEvent(frame("m1"));
  assert.deepEqual(seen, ["a:m1", "b:m1"]);
});

test("the socket closes when its last listener leaves, not before", () => {
  const { sockets, subscribe, open } = setup();
  const first = subscribe("chat:ws:chan", open, { onEvent: () => undefined });
  const second = subscribe("chat:ws:chan", open, { onEvent: () => undefined });
  first();
  first();
  assert.equal(sockets[0].stopped, false, "a second dispose of the same listener is a no-op");
  second();
  assert.equal(sockets[0].stopped, true);
  subscribe("chat:ws:chan", open, { onEvent: () => undefined });
  assert.equal(sockets.length, 2, "a later listener opens a fresh socket");
  second();
  assert.equal(sockets[1].stopped, false, "a stale disposer leaves the reopened socket alone");
  subscribe("chat:ws:chan", open, { onEvent: () => undefined });
  assert.equal(sockets.length, 2, "and keeps it shared: the next listener joins it");
});

test("a subscription that comes back after a drop tells every listener to catch up, once", () => {
  const { sockets, subscribe, open } = setup();
  const resumed: string[] = [];
  subscribe("chat:ws:chan", open, { onEvent: () => undefined, onResume: () => resumed.push("a") });
  subscribe("chat:ws:chan", open, { onEvent: () => undefined, onResume: () => resumed.push("b") });
  const { handlers } = sockets[0];
  handlers.onUp();
  assert.deepEqual(resumed, [], "the first subscription is not a resume");
  handlers.onDown();
  handlers.onDown();
  handlers.onUp();
  assert.deepEqual(resumed, ["a", "b"]);
  handlers.onUp();
  assert.deepEqual(resumed, ["a", "b"], "an up with no drop before it is not a resume");
});

test("a listener that left hears nothing more", () => {
  const { sockets, subscribe, open } = setup();
  const heard: string[] = [];
  const leave = subscribe("chat:ws:chan", open, { onEvent: () => heard.push("event"), onResume: () => heard.push("resume") });
  subscribe("chat:ws:chan", open, { onEvent: () => undefined });
  leave();
  sockets[0].handlers.onEvent(frame("m1"));
  sockets[0].handlers.onDown();
  sockets[0].handlers.onUp();
  assert.deepEqual(heard, []);
});

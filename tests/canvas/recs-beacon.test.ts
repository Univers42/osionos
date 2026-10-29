/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recs-beacon.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client's half of the beacon: the queue of impressions and clicks, the
 * three moments it leaves (ten seconds, twenty events, a hidden tab), and the
 * one thing it must never do — come back on its own after a failure.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createBeaconQueue } from "@/features/recs/api/beacon";

interface Sent {
  url: string;
  init: RequestInit;
}

/** A queue whose transport is recorded, and whose tick is in the test's hand. */
function recorder(answer: () => Promise<unknown> = async () => ({})) {
  const sent: Sent[] = [];
  let tick: (() => void) | null = null;
  let delay = 0;
  const queue = createBeaconQueue({
    base: () => "http://bridge.test",
    token: () => "session-token",
    send: async (url, init) => {
      sent.push({ url, init });
      return answer();
    },
    schedule: (fn, ms) => {
      tick = fn;
      delay = ms;
      return () => {
        tick = null;
      };
    },
    onHidden: () => () => undefined,
  });
  return { sent, queue, delay: () => delay, tick: () => tick?.() };
}

/** A document that says when the tab is hidden. */
function fakeDocument() {
  const listeners = new Map<string, (() => void)[]>();
  const doc = {
    visibilityState: "visible",
    addEventListener: (type: string, fn: () => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== fn));
    },
  };
  return {
    doc,
    hide: () => {
      doc.visibilityState = "hidden";
      for (const fn of listeners.get("visibilitychange") ?? []) fn();
    },
  };
}

test("the queue holds ONE event for the same page of the same slate", async () => {
  const { sent, queue } = recorder();
  queue.report("slate-1", "page-1", "impression");
  queue.report("slate-1", "page-1", "impression");
  queue.report("slate-1", "page-2", "impression");
  assert.equal(queue.size(), 2);
  await queue.flush();
  assert.equal(sent.length, 1);
  const body = JSON.parse(String(sent[0].init.body));
  assert.deepEqual(body.events, [
    { event: "impression", pageId: "page-1" },
    { event: "impression", pageId: "page-2" },
  ]);
});

test("an impression and a click of the same page are two events", async () => {
  const { sent, queue } = recorder();
  queue.report("slate-1", "page-1", "impression");
  queue.report("slate-1", "page-1", "click");
  await queue.flush();
  const body = JSON.parse(String(sent[0].init.body));
  assert.equal(body.events.length, 2);
});

test("the queue sends the slate and the events, and nothing else", async () => {
  const { sent, queue } = recorder();
  queue.report("slate-1", "page-1", "click");
  await queue.flush();
  const body = JSON.parse(String(sent[0].init.body));
  assert.deepEqual(Object.keys(body).sort(), ["events", "slate"]);
  assert.equal(body.slate, "slate-1");
  // The token is in the header, never in the body (C49).
  assert.equal(JSON.stringify(body).includes("session-token"), false);
});

test("the queue flushes at twenty events", async () => {
  const { sent, queue } = recorder();
  for (let index = 0; index < 19; index += 1) queue.report("slate-1", `page-${index}`, "impression");
  assert.equal(sent.length, 0);
  queue.report("slate-1", "page-19", "impression");
  assert.equal(sent.length, 1);
  const body = JSON.parse(String(sent[0].init.body));
  assert.equal(body.events.length, 20);
  assert.equal(queue.size(), 0);
});

test("the queue flushes on its own tick, ten seconds later", async () => {
  const { sent, queue, delay, tick } = recorder();
  queue.report("slate-1", "page-1", "impression");
  assert.equal(delay(), 10_000);
  assert.equal(sent.length, 0);
  tick();
  assert.equal(sent.length, 1);
  assert.equal(queue.size(), 0);
});

test("the queue flushes when the tab is hidden, with keepalive and the token", async () => {
  const { doc, hide } = fakeDocument();
  const globals = globalThis as unknown as { document?: unknown };
  globals.document = doc;
  try {
    const sent: Sent[] = [];
    const queue = createBeaconQueue({
      base: () => "http://bridge.test",
      token: () => "session-token",
      send: async (url, init) => {
        sent.push({ url, init });
        return {};
      },
      schedule: () => () => undefined,
    });
    queue.report("slate-1", "page-1", "impression");
    hide();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, "http://bridge.test/api/events/beacon");
    assert.equal(sent[0].init.method, "POST");
    assert.equal(sent[0].init.keepalive, true);
    const headers = sent[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer session-token");
  } finally {
    delete globals.document;
  }
});

test("a failed flush is DROPPED, and never retried in a loop", async () => {
  let attempts = 0;
  const { queue } = recorder(async () => {
    attempts += 1;
    throw new Error("the bridge is down");
  });
  queue.report("slate-1", "page-1", "impression");
  await queue.flush();
  assert.equal(attempts, 1);
  assert.equal(queue.size(), 0);
  // Nothing comes back on its own: the queue is empty and the tick is spent.
  await queue.flush();
  assert.equal(attempts, 1);
});

test("an event without a slate or without a page is not queued", () => {
  const { queue } = recorder();
  queue.report("", "page-1", "impression");
  queue.report("slate-1", "", "impression");
  assert.equal(queue.size(), 0);
});

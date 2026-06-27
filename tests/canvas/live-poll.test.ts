/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-poll.test.ts                                   :+:      :+:    :+:   */
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
  LivePoll,
  hashLiveRows,
} from "../../src/shared/notion-database-sys/src/store/live/livePoll.ts";

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

function makePoll(options: { intervalMs?: number } = {}) {
  const harness = {
    rows: [{ id: 1, name: "A" }, { id: 2, name: "B" }] as Record<string, unknown>[],
    fetches: 0,
    pending: 0,
    changes: 0,
    poll: null as unknown as LivePoll,
  };
  harness.poll = new LivePoll({
    fetchRows: async () => { harness.fetches += 1; return harness.rows; },
    pendingWrites: () => harness.pending,
    onChanged: () => { harness.changes += 1; },
    intervalMs: options.intervalMs,
  });
  return harness;
}

test("hash is row-order insensitive but value sensitive (pk-sorted JSON)", () => {
  const a = hashLiveRows([{ id: 1, v: "x" }, { id: 2, v: "y" }], ["id"]);
  const b = hashLiveRows([{ id: 2, v: "y" }, { id: 1, v: "x" }], ["id"]);
  const c = hashLiveRows([{ id: 1, v: "x" }, { id: 2, v: "CHANGED" }], ["id"]);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(hashLiveRows([], ["id"]), a); // row count is part of the print
});

test("no-op refetches emit nothing; a real change emits exactly once", async () => {
  const h = makePoll();
  h.poll.noteBaseline(h.rows, ["id"]);
  assert.equal(await h.poll.pollNow(), true);
  assert.equal(h.changes, 0); // identical first page → suppressed
  h.rows = [{ id: 1, name: "A" }, { id: 2, name: "EDITED" }];
  await h.poll.pollNow();
  assert.equal(h.changes, 1);
  await h.poll.pollNow(); // baseline advanced — converged, no re-emit
  assert.equal(h.changes, 1);
});

test("with no baseline the first pass seeds silently, then compares", async () => {
  const h = makePoll();
  await h.poll.pollNow(); // nothing to compare against yet
  assert.equal(h.changes, 0);
  h.rows = [{ id: 1, name: "NEW" }];
  await h.poll.pollNow();
  assert.equal(h.changes, 1);
});

test("pending outbox writes pause polling (gated, no fetch)", async () => {
  const h = makePoll();
  h.pending = 2;
  assert.equal(await h.poll.pollNow(), false); // gated → caller may retry
  assert.equal(h.fetches, 0); // optimistic state untouched
  h.pending = 0;
  assert.equal(await h.poll.pollNow(), true);
  assert.equal(h.fetches, 1);
});

test("hidden documents gate periodic polls; event refreshes may override", async () => {
  const h = makePoll();
  (globalThis as { document?: { visibilityState: string } }).document = { visibilityState: "hidden" };
  try {
    assert.equal(await h.poll.pollNow(), false);
    assert.equal(h.fetches, 0);
    assert.equal(await h.poll.pollNow({ ignoreVisibility: true }), true); // change evidence wins
    (globalThis as { document?: { visibilityState: string } }).document = { visibilityState: "visible" };
    assert.equal(await h.poll.pollNow(), true);
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
  assert.equal(h.fetches, 2);
});

test("start()/stop() drive the interval; stop halts fetching", async () => {
  const h = makePoll({ intervalMs: 3 });
  h.poll.start();
  await tick(20);
  h.poll.stop();
  assert.ok(h.fetches > 0);
  const seen = h.fetches;
  await tick(15);
  assert.equal(h.fetches, seen); // nothing after stop
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { analyse, analysePairs, parseServerTiming } from "./latencyStats.mjs";

test("parseServerTiming reads hops and the PostgREST count", () => {
  assert.deepEqual(
    parseServerTiming('session;dur=0.4, membership;dur=12.5, access;dur=80, publish;dur=9, postgrest;desc="7", total;dur=104.2'),
    { session: 0.4, membership: 12.5, access: 80, publish: 9, postgrest: 7, total: 104.2 },
  );
  assert.deepEqual(parseServerTiming(null), {});
});

test("analyse joins keystrokes to observed length, posts, frames and DOM writes", () => {
  const out = analyse({
    keys: [0, 100, 200],
    baseLen: 5,
    samples: [{ t: 330, len: 7 }, { t: 340, len: 8 }],
    posts: [{ start: 250, end: 300, serverTiming: { total: 40, postgrest: 6 } }],
    frames: [310],
    doms: [325],
  });
  assert.equal(out.sent, 3);
  assert.equal(out.lost, 0);
  assert.equal(out.keyToDomMs?.max, 330 - 0);
  assert.equal(out.keyToDomMs?.p50, 330 - 100);
  assert.equal(out.keyToDomMs?.n, 3);
  assert.equal(out.hopsMs.keyToPost?.p50, 150);
  assert.equal(out.hopsMs.postToFrame?.p50, 60);
  assert.equal(out.hopsMs.frameToDom?.p50, 15);
  assert.equal(out.hopsMs.postRoundTrip?.p50, 50);
  assert.equal(out.hopsMs.server.postgrest?.p50, 6);
});

test("a character the member never saw counts as lost", () => {
  const out = analyse({ keys: [0, 10, 20], baseLen: 0, samples: [{ t: 50, len: 2 }] });
  assert.equal(out.lost, 1);
  assert.equal(out.observed, 2);
  assert.equal(out.hopsMs.frameToDom, null);
});

test("no keystrokes is zero loss, not NaN", () => {
  assert.equal(analyse({ keys: [], baseLen: 0, samples: [] }).lossRatio, 0);
});

test("analysePairs counts loss", () => {
  const out = analysePairs([
    { typist: "u1", observer: "u2", keys: [0, 10, 20], baseLen: 0, samples: [{ t: 50, len: 2 }] },
  ]);
  assert.equal(out.pairs.length, 1);
  assert.equal(out.pairs[0].sent, 3);
  assert.equal(out.pairs[0].lost, 1);
  assert.equal(out.aggregate.lost, 1);
  assert.equal(out.aggregate.sent, 3);
});

test("analysePairs handles out-of-order samples", () => {
  const ordered = analysePairs([
    { typist: "u1", observer: "u2", keys: [0, 100, 200], baseLen: 0, samples: [{ t: 50, len: 1 }, { t: 150, len: 2 }, { t: 250, len: 3 }] },
  ]);
  const shuffled = analysePairs([
    { typist: "u1", observer: "u2", keys: [0, 100, 200], baseLen: 0, samples: [{ t: 250, len: 3 }, { t: 50, len: 1 }, { t: 150, len: 2 }] },
  ]);
  assert.deepEqual(shuffled.pairs[0].keyToDomMs, ordered.pairs[0].keyToDomMs);
  assert.equal(ordered.pairs[0].lost, 0);
});

test("analysePairs: zero samples means lost = sent", () => {
  const out = analysePairs([
    { typist: "u1", observer: "u2", keys: [0, 10, 20], baseLen: 0, samples: [] },
  ]);
  assert.equal(out.pairs[0].lost, 3);
  assert.equal(out.pairs[0].sent, 3);
  assert.equal(out.pairs[0].keyToDomMs, null);
});

test("analysePairs percentiles on a tiny fixture", () => {
  const out = analysePairs([
    { typist: "u1", observer: "u2", keys: [0, 10, 20], baseLen: 0, samples: [{ t: 10, len: 1 }, { t: 30, len: 2 }, { t: 50, len: 3 }] },
    { typist: "u2", observer: "u1", keys: [0], baseLen: 0, samples: [{ t: 40, len: 1 }] },
  ]);
  assert.equal(out.aggregate.keyToDomMs.n, 4);
  assert.equal(out.aggregate.keyToDomMs.p50, 20);
  assert.equal(out.aggregate.keyToDomMs.p95, 40);
  assert.equal(out.aggregate.keyToDomMs.max, 40);
  assert.equal(out.slowest.typist, "u2");
  assert.equal(out.slowest.observer, "u1");
});
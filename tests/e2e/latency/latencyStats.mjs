// Pure maths of the co-editing latency spec: joins the owner's keystrokes, the owner's
// event POSTs, the member's frame/DOM marks and the member's observed block length into
// per-character key-to-DOM latency and per-hop numbers. All times are epoch milliseconds.
//
// Caveat: a character typed while an earlier batch is still in flight is attributed to the
// next POST that starts after it, and the frame mark is the first frame of ANY type after
// that POST, so a presence or caret frame can stand in for the content frame and shrink the
// "post to frame" hop (the end-to-end key-to-DOM number is exact either way). Hops are null
// when the member build carries no collab marks (client older than collabLatencyMarks.ts).

import { percentile } from "../perf/perfHarness.mjs";

const firstAtOrAfter = (sortedTimes, t) => sortedTimes.find((candidate) => candidate >= t);

function summary(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  return { n: finite.length, p50: percentile(finite, 50), p95: percentile(finite, 95), max: Math.max(...finite) };
}

/** First time the observed length reached `length`, or undefined (the character was lost). */
function observedAt(samples, length) {
  return samples.find((sample) => sample.len >= length)?.t;
}

function computeAnalysis({ keys, samples, baseLen, posts = [], frames = [], doms = [] }) {
  const sortedPosts = [...posts].sort((a, b) => a.start - b.start);
  const postStarts = sortedPosts.map((post) => post.start);
  const sortedFrames = [...frames].sort((a, b) => a - b);
  const sortedDoms = [...doms].sort((a, b) => a - b);
  const sortedSamples = [...samples].sort((a, b) => a.t - b.t);
  const keyToDom = [];
  const keyToPost = [];
  const postToFrame = [];
  const frameToDom = [];
  let lost = 0;
  keys.forEach((keyAt, index) => {
    const seenAt = observedAt(sortedSamples, baseLen + index + 1);
    if (seenAt === undefined) { lost += 1; return; }
    keyToDom.push(seenAt - keyAt);
    const postAt = firstAtOrAfter(postStarts, keyAt);
    if (postAt === undefined) return;
    keyToPost.push(postAt - keyAt);
    const frameAt = firstAtOrAfter(sortedFrames, postAt);
    if (frameAt === undefined) return;
    postToFrame.push(frameAt - postAt);
    const domAt = firstAtOrAfter(sortedDoms, frameAt);
    if (domAt !== undefined) frameToDom.push(domAt - frameAt);
  });
  const hopNames = new Set(sortedPosts.flatMap((post) => Object.keys(post.serverTiming ?? {})));
  const serverHops = Object.fromEntries([...hopNames].map((name) => [
    name, summary(sortedPosts.map((post) => post.serverTiming?.[name])),
  ]));
  const result = {
    sent: keys.length,
    observed: keys.length - lost,
    lost,
    lossRatio: keys.length === 0 ? 0 : lost / keys.length,
    keyToDomMs: summary(keyToDom),
    hopsMs: {
      keyToPost: summary(keyToPost),
      postRoundTrip: summary(sortedPosts.map((post) => post.end - post.start)),
      postToFrame: summary(postToFrame),
      frameToDom: summary(frameToDom),
      server: serverHops,
    },
    posts: sortedPosts.length,
  };
  return { result, keyToDom };
}

/**
 * keys: epoch ms of each keydown, in order. samples: [{t, len}] of the observer's block text
 * length over time. baseLen: length before typing. posts: [{start, end, serverTiming}] of the
 * typist's events POSTs. frames/doms: epoch ms of the observer's collab marks (may be empty).
 */
export function analyse({ keys, samples, baseLen, posts = [], frames = [], doms = [] }) {
  return computeAnalysis({ keys, samples, baseLen, posts, frames, doms }).result;
}

/** pairs: [{typist, observer, ...analyse input}] -> per pair, all-pairs aggregate, slowest pair by p95. */
export function analysePairs(pairs = []) {
  const computed = pairs.map((pair) => {
    const { result, keyToDom } = computeAnalysis({
      keys: pair.keys ?? [],
      samples: pair.samples ?? [],
      baseLen: pair.baseLen ?? 0,
      posts: pair.posts ?? [],
      frames: pair.frames ?? [],
      doms: pair.doms ?? [],
    });
    return { pair, result, keyToDom };
  });
  const pairResults = computed.map(({ pair, result }) => ({
    typist: pair.typist,
    observer: pair.observer,
    sent: result.sent,
    lost: result.lost,
    keyToDomMs: result.keyToDomMs,
  }));
  const allLatencies = computed.flatMap((entry) => entry.keyToDom);
  const aggregate = {
    sent: pairResults.reduce((total, pair) => total + pair.sent, 0),
    lost: pairResults.reduce((total, pair) => total + pair.lost, 0),
    keyToDomMs: summary(allLatencies),
  };
  let slowest = null;
  for (const pairResult of pairResults) {
    if (slowest === null) { slowest = pairResult; continue; }
    const currentP95 = pairResult.keyToDomMs?.p95 ?? -Infinity;
    const slowestP95 = slowest.keyToDomMs?.p95 ?? -Infinity;
    if (currentP95 > slowestP95) slowest = pairResult;
  }
  return { pairs: pairResults, aggregate, slowest };
}

/** Server-Timing header -> { hop: ms }, with the PostgREST call count under `postgrest`. */
export function parseServerTiming(header) {
  const out = {};
  for (const part of String(header ?? "").split(",")) {
    const [name, ...params] = part.trim().split(";");
    if (!name) continue;
    const fields = Object.fromEntries(params.map((param) => param.trim().split("=")));
    const value = name === "postgrest" ? Number(String(fields.desc ?? "").replace(/"/g, "")) : Number(fields.dur);
    if (Number.isFinite(value)) out[name] = value;
  }
  return out;
}
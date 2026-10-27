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

/**
 * keys: epoch ms of each keydown, in order. samples: [{t, len}] of the member's block text
 * length over time. baseLen: length before typing. posts: [{start, end, serverTiming}] of the
 * owner's events POSTs. frames/doms: epoch ms of the member's collab marks (may be empty).
 */
export function analyse({ keys, samples, baseLen, posts = [], frames = [], doms = [] }) {
  const sortedPosts = [...posts].sort((a, b) => a.start - b.start);
  const postStarts = sortedPosts.map((post) => post.start);
  const sortedFrames = [...frames].sort((a, b) => a - b);
  const sortedDoms = [...doms].sort((a, b) => a - b);
  const keyToDom = [];
  const keyToPost = [];
  const postToFrame = [];
  const frameToDom = [];
  let lost = 0;
  keys.forEach((keyAt, index) => {
    const seenAt = observedAt(samples, baseLen + index + 1);
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
  return {
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

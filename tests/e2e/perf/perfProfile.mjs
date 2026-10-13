/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   perfProfile.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// CPU sampling profiles (V8 Profiler over CDP) reduced to per-function self/total ms.
//
// Ponytail: a sampling profile is one stack snapshot every `interval` us, so any function that
// runs and returns between two ticks is invisible (costs are under-reported, never invented),
// and a callee V8 inlined is attributed to its caller (self time migrates up the stack).
// Line numbers are the dev server's transformed output, not the TS source. The profiler's own
// sampling overhead inflates totalMs by a few %. This is an instrument, not a gate: it reports
// where a keystroke's CPU time goes, it does not judge it.

const SPECIAL_KEYS = new Set(["(program)", "(idle)", "(garbage collector)"]);
const VITE_DEPS = "node_modules/.vite/deps/";

/** Dev-server url -> short url: path after the origin, query stripped; vite deps -> package file. */
function shortUrl(url) {
  const clean = url.split("?")[0];
  const deps = clean.indexOf(VITE_DEPS);
  if (deps !== -1) return clean.slice(deps + VITE_DEPS.length);
  const scheme = clean.indexOf("://");
  if (scheme === -1) return clean;
  const pathStart = clean.indexOf("/", scheme + 3);
  return pathStart === -1 ? "/" : clean.slice(pathStart);
}

/** The identity of a frame in the tables: name + short url + 1-based line; specials stand alone. */
function functionKey(callFrame) {
  const name = callFrame.functionName || "(anonymous)";
  if (SPECIAL_KEYS.has(name)) return name;
  return `${name} ${shortUrl(callFrame.url)}:${callFrame.lineNumber + 1}`;
}

/**
 * Reduces a raw V8 profile to per-function self and total (inclusive) milliseconds.
 * Self: deltas of samples whose LEAF node has the key. Total: each sample's delta is added to
 * every DISTINCT key on the leaf -> root path, so a recursive frame counts once per sample, not
 * once per stack level. pct is computed against totalMs with (idle) excluded, so a key can
 * exceed 100% when idle dominates. O(nodes + samples * depth), depth <= nodes; accumulation
 * stays in integer microseconds and converts once, so the ms sums are exact.
 */
export function aggregateProfile(profile) {
  const nodes = profile.nodes ?? [];
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  const keyOf = new Map();
  const parentOf = new Map();
  for (const node of nodes) {
    keyOf.set(node.id, functionKey(node.callFrame));
    for (const child of node.children ?? []) parentOf.set(child, node.id);
  }
  const selfUs = new Map();
  const totalUs = new Map();
  let totalUsAll = 0;
  for (let index = 0; index < samples.length; index += 1) {
    // timeDeltas[index] is the interval that ran out BETWEEN sample index-1 and sample index
    // (for index 0, since Profiler.start): the interval ENDS at sample index, so its cost
    // belongs to the stack captured AT sample index - attribute deltas[i] to samples[i].
    const delta = deltas[index] ?? 0;
    totalUsAll += delta;
    const leafKey = keyOf.get(samples[index]);
    if (leafKey === undefined) continue; // sample of a node V8 pruned from the tree
    selfUs.set(leafKey, (selfUs.get(leafKey) ?? 0) + delta);
    const counted = new Set();
    let node = samples[index];
    // V8 emits a tree; the depth bound only exists so a corrupt parent cycle cannot spin.
    for (let depth = 0; node !== undefined && depth <= nodes.length; depth += 1) {
      const key = keyOf.get(node);
      if (key !== undefined && !counted.has(key)) {
        counted.add(key);
        totalUs.set(key, (totalUs.get(key) ?? 0) + delta);
      }
      node = parentOf.get(node);
    }
  }
  const pctBaseUs = totalUsAll - (selfUs.get("(idle)") ?? 0);
  const toRows = (map) => [...map.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, us]) => ({ key, ms: us / 1000, pct: pctBaseUs > 0 ? (us / pctBaseUs) * 100 : 0 }));
  return { totalMs: totalUsAll / 1000, self: toRows(selfUs), total: toRows(totalUs) };
}

/** Aligned plain-text table of the first n rows: ms and pct right-aligned, key left as-is. O(n). */
export function formatTop(rows, n) {
  const top = rows.slice(0, n);
  const msWidth = Math.max(2, ...top.map((row) => row.ms.toFixed(1).length));
  const pctWidth = Math.max(1, ...top.map((row) => `${row.pct.toFixed(1)}%`.length));
  const lines = [`${"ms".padStart(msWidth)}  ${"%".padStart(pctWidth)}  key`];
  for (const row of top) {
    lines.push(`${row.ms.toFixed(1).padStart(msWidth)}  ${`${row.pct.toFixed(1)}%`.padStart(pctWidth)}  ${row.key}`);
  }
  return lines.join("\n");
}

/**
 * Runs `action` under the V8 CPU profiler and returns the raw profile (the object Chrome
 * DevTools loads as a .cpuprofile). samplingIntervalUs is the stack-snapshot period: smaller
 * catches shorter functions at a higher overhead cost.
 */
export async function profileDuring(page, action, { samplingIntervalUs = 100 } = {}) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Profiler.enable");
    await session.send("Profiler.setSamplingInterval", { interval: samplingIntervalUs });
    await session.send("Profiler.start");
    await action();
    const { profile } = await session.send("Profiler.stop");
    return profile;
  } finally {
    await session.detach();
  }
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   syntheticGraph.ts                                   :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Deterministic synthetic GraphModel for benchmarks and visual tests
 * (`?graphBench=N`). Preferential-attachment topology gives a realistic
 * hub/leaf degree distribution; the seeded PRNG keeps screenshots and FPS
 * runs reproducible across builds.
 */

import {
  indexModel,
  type GraphEdge,
  type GraphModel,
  type GraphNode,
} from "@/features/second-brain/model/graphModel";
import { applyDegreeWeights } from "@/features/second-brain/model/weights";

const DATABASES = 8;
const EMOJI = ["🚀", "📚", "🧠", "🌿", "🔬", "🎯", "🗺️", "💡", "🎨", "⚙️", "📈", "🧩"];
const GROUPS = ["Active", "Draft", "Review", "Done", "Archived"];
const ICONS = ["icon:rocket", "icon:book", "icon:target", "icon:map"];

/** mulberry32 — tiny seeded PRNG, deterministic across runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function syntheticNode(i: number, rnd: () => number): GraphNode {
  const roll = rnd();
  const icon = roll < 0.6
    ? EMOJI[Math.floor(rnd() * EMOJI.length)]
    : roll < 0.8
      ? ICONS[Math.floor(rnd() * ICONS.length)]
      : undefined;
  return {
    id: `bench:db-${i % DATABASES}:${i}`,
    kind: i % 23 === 0 ? "note" : "record",
    databaseId: `db-${i % DATABASES}`,
    source: "bench",
    label: `Node ${i}`,
    group: GROUPS[i % GROUPS.length],
    weight: 0.5,
    version: 0,
    hasNote: i % 17 === 0,
    icon,
  };
}

function syntheticEdges(count: number, rnd: () => number, ids: string[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const push = (a: number, b: number, kind: GraphEdge["kind"]): void => {
    if (a === b) return;
    edges.push({
      id: `bench-e-${edges.length}`,
      source: ids[a],
      target: ids[b],
      kind,
      label: "",
      strength: 0.4 + rnd() * 0.4,
      directed: kind === "relation",
    });
  };
  // Preferential attachment: each node links to ~1.5 earlier nodes, biased
  // toward low indices (rnd()^2) so early nodes become hubs.
  for (let i = 1; i < count; i += 1) {
    push(i, Math.floor(rnd() * rnd() * i), "relation");
    if (rnd() < 0.5) push(i, Math.floor(rnd() * rnd() * i), "relation");
  }
  const extras = Math.floor(count * 0.05);
  for (let i = 0; i < extras; i += 1) {
    push(Math.floor(rnd() * count), Math.floor(rnd() * count), "note_link");
  }
  return edges;
}

/** Build a deterministic n-node model (icons included for LOD testing). */
export function buildSyntheticModel(n: number): GraphModel {
  // Bench-only hook (?graphBench=N). Cap at 100k: the render pipeline (LOD cluster-blobs +
  // node budget) is designed for this band; higher would OOM the resident per-node model.
  const count = Math.max(2, Math.min(n, 100_000));
  const rnd = mulberry32(0x051042);
  const nodes: GraphNode[] = [];
  for (let i = 0; i < count; i += 1) nodes.push(syntheticNode(i, rnd));
  const edges = syntheticEdges(count, rnd, nodes.map((node) => node.id));
  applyDegreeWeights(nodes, edges);
  return indexModel(nodes, edges);
}

/** The `?graphBench=N` hook: parsed once per page load (0 = disabled). */
export function graphBenchCount(): number {
  if (globalThis.window === undefined) return 0;
  const raw = new URLSearchParams(globalThis.location.search).get("graphBench");
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

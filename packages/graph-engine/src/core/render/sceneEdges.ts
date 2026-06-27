/**
 * Edge-side columnar state, split out of SceneState: flat edge buffers,
 * bucket×tier render groups, per-node degree, a CSR node→edge index
 * (hover energy-flow and neighbor lookups in O(degree)), and the hub set
 * (top-degree nodes that get always-on labels, halos, and arc gauges).
 */

import type { EdgeKind, GraphModel, NodeId } from "../types";
import { TIERS, strengthTier } from "./tiers";

/** relation=0, tag=1, note=2, hierarchy=3 */
export type EdgeBucketId = 0 | 1 | 2 | 3;

const HUB_CAP = 32;
const HUB_MIN_DEGREE = 6;
const HUB_SHARE = 0.02;

export class SceneEdges {
  edgeFrom = new Uint32Array(0);
  edgeTo = new Uint32Array(0);
  edgeBucket = new Uint8Array(0);
  edgeStrength = new Float32Array(0);
  edgeDirected = new Uint8Array(0);
  /** Edge indices grouped by bucket×tier (length 4*TIERS) for batched strokes. */
  edgeGroups: number[][] = [];
  /** Per-node link count (doubles as the card link-count badge). */
  degree = new Uint16Array(0);
  /** CSR node→edge index: edges touching node i are nodeEdgeList[offsets[i]..offsets[i+1]). */
  nodeEdgeOffsets = new Int32Array(1);
  nodeEdgeList = new Int32Array(0);
  /** 1 for the top-degree "hub" nodes (≤32, ≥6 links, ~top 2%). */
  isHub = new Uint8Array(0);
  maxHubDegree = 1;

  build(model: GraphModel, idToIndex: Map<NodeId, number>, count: number): void {
    const edges = model.edges;
    this.edgeFrom = new Uint32Array(edges.length);
    this.edgeTo = new Uint32Array(edges.length);
    this.edgeBucket = new Uint8Array(edges.length);
    this.edgeStrength = new Float32Array(edges.length);
    this.edgeDirected = new Uint8Array(edges.length);
    this.edgeGroups = Array.from({ length: 4 * TIERS }, () => []);
    this.degree = new Uint16Array(count);
    for (let e = 0; e < edges.length; e += 1) {
      const from = idToIndex.get(edges[e].source);
      const to = idToIndex.get(edges[e].target);
      if (from === undefined || to === undefined) continue;
      const bucket = bucketOf(edges[e].kind);
      this.edgeFrom[e] = from;
      this.edgeTo[e] = to;
      this.edgeBucket[e] = bucket;
      this.edgeStrength[e] = edges[e].strength;
      this.edgeDirected[e] = edges[e].directed ? 1 : 0;
      this.edgeGroups[bucket * TIERS + strengthTier(edges[e].strength)].push(e);
      if (this.degree[from] < 0xffff) this.degree[from] += 1;
      if (this.degree[to] < 0xffff) this.degree[to] += 1;
    }
    this.buildCsr(edges.length, count);
    this.markHubs(count);
  }

  /** CSR adjacency from the already-filled edge endpoint columns. */
  private buildCsr(edgeCount: number, count: number): void {
    this.nodeEdgeOffsets = new Int32Array(count + 1);
    for (let e = 0; e < edgeCount; e += 1) {
      this.nodeEdgeOffsets[this.edgeFrom[e] + 1] += 1;
      this.nodeEdgeOffsets[this.edgeTo[e] + 1] += 1;
    }
    for (let i = 0; i < count; i += 1) this.nodeEdgeOffsets[i + 1] += this.nodeEdgeOffsets[i];
    this.nodeEdgeList = new Int32Array(this.nodeEdgeOffsets[count]);
    const cursor = this.nodeEdgeOffsets.slice();
    for (let e = 0; e < edgeCount; e += 1) {
      this.nodeEdgeList[cursor[this.edgeFrom[e]]] = e;
      cursor[this.edgeFrom[e]] += 1;
      this.nodeEdgeList[cursor[this.edgeTo[e]]] = e;
      cursor[this.edgeTo[e]] += 1;
    }
  }

  private markHubs(count: number): void {
    this.isHub = new Uint8Array(count);
    this.maxHubDegree = 1;
    const order: number[] = [];
    for (let i = 0; i < count; i += 1) {
      if (this.degree[i] >= HUB_MIN_DEGREE) order.push(i);
    }
    order.sort((a, b) => this.degree[b] - this.degree[a]);
    const take = Math.min(order.length, HUB_CAP, Math.max(4, Math.round(count * HUB_SHARE)));
    for (let k = 0; k < take; k += 1) {
      this.isHub[order[k]] = 1;
      if (this.degree[order[k]] > this.maxHubDegree) this.maxHubDegree = this.degree[order[k]];
    }
  }
}

export function bucketOf(kind: EdgeKind): EdgeBucketId {
  if (kind === "tag") return 1;
  if (kind === "note_of" || kind === "note_link") return 2;
  if (kind === "hierarchy") return 3;
  return 0;
}

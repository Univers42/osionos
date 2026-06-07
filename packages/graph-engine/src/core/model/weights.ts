/**
 * Derive each node's visual `weight` (0..1) from its degree on a log scale, so a
 * node with more relationships reads clearly larger while isolated nodes keep a
 * legible floor. We normalize against a FIXED reference degree (not the global
 * max) so everyday counts (1..~8) spread across the size range instead of being
 * flattened by a few mega-hubs.
 */

import type { GraphEdge, GraphNode, NodeId } from "../types";
import { clamp } from "../math";

const REFERENCE_DEGREE = 8;

export function applyDegreeWeights(nodes: GraphNode[], edges: GraphEdge[]): void {
  const degree = new Map<NodeId, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  const denominator = Math.log1p(REFERENCE_DEGREE);

  for (const node of nodes) {
    const nodeDegree = degree.get(node.id) ?? 0;
    node.weight = clamp(0.2 + 0.8 * (Math.log1p(nodeDegree) / denominator), 0.2, 1);
  }
}

/** Map a node's 0..1 weight to a pixel radius within [min, max]. */
export function weightToRadius(weight: number, min: number, max: number): number {
  return min + clamp(weight, 0, 1) * (max - min);
}

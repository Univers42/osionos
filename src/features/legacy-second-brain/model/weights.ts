/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   weights.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { GraphEdge, GraphNode, NodeId } from "./graphModel";
import { clamp } from "./value";

/**
 * Reference degree that maps to ~full size. We normalize against a FIXED degree
 * (not the global max) so everyday relationship counts (1..~8) spread across the
 * visible size range — otherwise a few mega-hubs (e.g. a tag/data node with ~100
 * links) flatten every note's degree of 1–3 into nearly the same dot. Degrees at
 * or above this saturate at the top size.
 */
const REFERENCE_DEGREE = 8;

/**
 * Derive each node's visual `weight` (0..1) from its degree on a log scale, so a
 * node with more relationships reads clearly larger; isolated nodes keep a legible
 * floor. Shared by the local projection (`deriveGraph`) and the BaaS response
 * mapper so both produce consistent sizing.
 */
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

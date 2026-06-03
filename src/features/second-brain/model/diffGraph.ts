/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   diffGraph.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { type GraphModel, type GraphPatch, nodesEqual } from "./graphModel";

/**
 * Incremental diff between two models (doc 01 §6) — the performance unlock.
 *
 * Because node/edge ids are deterministic, a single edit yields a tiny patch
 * (typically one `updatedNode`), which the layout worker and renderer apply
 * instead of rebuilding the world. Set-difference over the id maps → O(N + E).
 */
export function diffGraph(previous: GraphModel, next: GraphModel): GraphPatch {
  const addedNodes = [];
  const updatedNodes = [];
  for (const node of next.nodeById.values()) {
    const before = previous.nodeById.get(node.id);
    if (!before) addedNodes.push(node);
    else if (!nodesEqual(before, node)) updatedNodes.push(node);
  }

  const removedNodeIds = [];
  for (const id of previous.nodeById.keys()) {
    if (!next.nodeById.has(id)) removedNodeIds.push(id);
  }

  const addedEdges = [];
  for (const edge of next.edgeById.values()) {
    if (!previous.edgeById.has(edge.id)) addedEdges.push(edge);
  }

  const removedEdgeIds = [];
  for (const id of previous.edgeById.keys()) {
    if (!next.edgeById.has(id)) removedEdgeIds.push(id);
  }

  return { addedNodes, updatedNodes, removedNodeIds, addedEdges, removedEdgeIds };
}

/** True when a patch carries no changes (skip worker/render work entirely). */
export function isEmptyPatch(patch: GraphPatch): boolean {
  return (
    patch.addedNodes.length === 0 &&
    patch.updatedNodes.length === 0 &&
    patch.removedNodeIds.length === 0 &&
    patch.addedEdges.length === 0 &&
    patch.removedEdgeIds.length === 0
  );
}

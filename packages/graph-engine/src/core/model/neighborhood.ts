/**
 * BFS the model's adjacency index to collect a node's neighborhood (the node plus
 * everything within `depth` hops). Used to drive focus-dimming when a node is
 * selected. Pure, O(reachable edges).
 */

import type { GraphModel, NodeId } from "../types";

export function neighborhood(model: GraphModel, id: NodeId, depth = 1): Set<NodeId> {
  const seen = new Set<NodeId>([id]);
  let frontier: NodeId[] = [id];
  for (let hop = 0; hop < depth; hop += 1) {
    const next: NodeId[] = [];
    for (const nodeId of frontier) {
      for (const edgeId of model.adjacency.get(nodeId) ?? []) {
        const edge = model.edgeById.get(edgeId);
        if (!edge) continue;
        const other = edge.source === nodeId ? edge.target : edge.source;
        if (!seen.has(other)) {
          seen.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

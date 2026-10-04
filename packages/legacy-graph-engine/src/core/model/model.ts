/**
 * Assemble and compare GraphModels. `indexModel` is a single O(N + E) pass that
 * de-dupes by id, drops dangling edges, and builds every index the engine and
 * console rely on (adjacency for focus, byDatabase for filters).
 */

import type { EdgeId, GraphEdge, GraphModel, GraphNode, NodeId } from "../types";

/** True when two nodes are value-equal for diffing (ignores lazy `fields`). */
export function nodesEqual(a: GraphNode, b: GraphNode): boolean {
  return (
    a.kind === b.kind &&
    a.databaseId === b.databaseId &&
    a.source === b.source &&
    a.label === b.label &&
    a.group === b.group &&
    a.weight === b.weight &&
    a.version === b.version &&
    a.hasNote === b.hasNote
  );
}

/** Assemble a `GraphModel` from raw nodes + edges in a single pass. */
export function indexModel(rawNodes: GraphNode[], rawEdges: GraphEdge[]): GraphModel {
  const nodeById = new Map<NodeId, GraphNode>();
  for (const node of rawNodes) {
    if (!nodeById.has(node.id)) nodeById.set(node.id, node);
  }

  const edgeById = new Map<EdgeId, GraphEdge>();
  const adjacency = new Map<NodeId, EdgeId[]>();
  const byDatabase = new Map<string, NodeId[]>();
  let notes = 0;

  for (const edge of rawEdges) {
    if (edgeById.has(edge.id)) continue;
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    edgeById.set(edge.id, edge);
    push(adjacency, edge.source, edge.id);
    push(adjacency, edge.target, edge.id);
  }

  for (const node of nodeById.values()) {
    if (node.kind === "note") notes += 1;
    if (node.databaseId != null) push(byDatabase, node.databaseId, node.id);
  }

  const nodes = [...nodeById.values()];
  const edges = [...edgeById.values()];
  return {
    nodes,
    edges,
    nodeById,
    edgeById,
    adjacency,
    byDatabase,
    stats: { nodes: nodes.length, edges: edges.length, databases: byDatabase.size, notes },
  };
}

/** Empty model (initial state, before any derive). */
export function emptyModel(): GraphModel {
  return indexModel([], []);
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

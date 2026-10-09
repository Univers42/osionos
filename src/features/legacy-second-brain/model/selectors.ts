/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   selectors.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { EdgeId, GraphModel, NodeId } from "./graphModel";

/**
 * Index-backed read paths used by the render & UI layers (doc 01 §7).
 * Every selector is pure and runs off the precomputed `adjacency`/`byDatabase`
 * indexes, so hover/focus/search stay O(degree)/O(matches) — not O(graph).
 */

export interface Neighborhood {
  nodeIds: Set<NodeId>;
  edgeIds: Set<EdgeId>;
}

/** BFS the `depth`-hop neighborhood of a node via the adjacency index. */
export function neighborhood(model: GraphModel, nodeId: NodeId, depth = 1): Neighborhood {
  const nodeIds = new Set<NodeId>();
  const edgeIds = new Set<EdgeId>();
  if (!model.nodeById.has(nodeId)) return { nodeIds, edgeIds };

  nodeIds.add(nodeId);
  let frontier: NodeId[] = [nodeId];
  for (let hop = 0; hop < depth; hop += 1) {
    const next: NodeId[] = [];
    for (const current of frontier) {
      for (const edgeId of model.adjacency.get(current) ?? []) {
        edgeIds.add(edgeId);
        const edge = model.edgeById.get(edgeId);
        if (!edge) continue;
        const other = edge.source === current ? edge.target : edge.source;
        if (!nodeIds.has(other)) {
          nodeIds.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return { nodeIds, edgeIds };
}

export type FocusState = "active" | "related" | "dimmed";

/**
 * Returns a classifier for focus-mode rendering (doc 05): the focused node is
 * `active`, its 1-hop neighbors `related`, everything else `dimmed`.
 */
export function focusDimming(model: GraphModel, focusId: NodeId | null): (id: NodeId) => FocusState {
  if (!focusId || !model.nodeById.has(focusId)) return () => "active";
  const related = neighborhood(model, focusId, 1).nodeIds;
  return (id: NodeId): FocusState => {
    if (id === focusId) return "active";
    return related.has(id) ? "related" : "dimmed";
  };
}

/** Id-level visibility view for legend/database filters (no graph copy). */
export function filterByDatabase(model: GraphModel, enabledDatabaseIds: ReadonlySet<string>): Neighborhood {
  const nodeIds = new Set<NodeId>();
  for (const node of model.nodes) {
    // Synthetic nodes (tags/notes with null databaseId) are always shown.
    if (node.databaseId == null || enabledDatabaseIds.has(node.databaseId)) {
      nodeIds.add(node.id);
    }
  }
  const edgeIds = new Set<EdgeId>();
  for (const edge of model.edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) edgeIds.add(edge.id);
  }
  return { nodeIds, edgeIds };
}

/** The `k` highest-weight node ids — which labels to draw at low zoom (LOD). */
export function topByWeight(model: GraphModel, k: number): NodeId[] {
  return [...model.nodes]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, Math.max(0, k))
    .map((node) => node.id);
}

export interface SearchIndex {
  search: (query: string, limit?: number) => NodeId[];
}

/**
 * A dependency-free prefix/substring search over label + group. Rebuilt on each
 * `GraphPatch`; cheap enough for 10k labels. (A trie/MiniSearch can replace this
 * later without changing the call site.)
 */
export function buildSearchIndex(model: GraphModel): SearchIndex {
  const entries = model.nodes.map((node) => ({
    id: node.id,
    haystack: `${node.label} ${node.group ?? ""}`.toLowerCase(),
    weight: node.weight,
  }));

  return {
    search(query: string, limit = 20): NodeId[] {
      const needle = query.trim().toLowerCase();
      if (!needle) return [];
      return entries
        .filter((entry) => entry.haystack.includes(needle))
        .sort((a, b) => prefixRank(a.haystack, needle) - prefixRank(b.haystack, needle) || b.weight - a.weight)
        .slice(0, limit)
        .map((entry) => entry.id);
    },
  };
}

/** Rank prefix matches ahead of mid-string matches. */
function prefixRank(haystack: string, needle: string): number {
  return haystack.startsWith(needle) ? 0 : 1;
}

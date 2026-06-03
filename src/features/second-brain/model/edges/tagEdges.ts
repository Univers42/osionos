/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tagEdges.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { NotionState } from "@notion-db/contract-types";
import {
  type GraphEdge,
  type GraphNode,
  type NodeId,
  makeEdgeId,
  makeRecordNodeId,
  makeTagNodeId,
} from "../graphModel";
import { arrayValue } from "../value";

/**
 * Synthesize edges for schemaless data from shared tags (doc 03).
 *
 * Two modes, chosen to AVOID the O(n²) explosion that naive "link everything
 * sharing a tag" would cause:
 *   • tag-hub  — each tag is a hub node; N members ⇒ N edges (default, safe).
 *   • pairwise — members link directly; only for low-cardinality tags.
 * Plus a global edge-budget circuit-breaker. Singleton tags create no edges.
 */

export interface TagConfig {
  /** databaseId → the property id whose array value holds tags. */
  tagProperties: Record<string, string>;
  /** Materialize a hub node per tag instead of pairwise links (default true). */
  materializeTagNodes?: boolean;
  /** Above this member count, a tag is forced to hub mode (default 25). */
  maxPairwiseTagDegree?: number;
  /** Ignore tags used fewer than this many times (default 2). */
  minTagWeight?: number;
  /** Hard ceiling on synthesized tag edges; excess tags fall back to hubs. */
  maxEdges?: number;
}

const HUB_STRENGTH = 0.7;
const PAIRWISE_STRENGTH = 0.5;

export interface TagEdgeResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** True when the budget guard forced some tags to hub mode. */
  budgetClamped: boolean;
}

export function tagEdges(
  state: NotionState,
  source: string,
  nodeIds: ReadonlySet<NodeId>,
  config?: TagConfig,
): TagEdgeResult {
  if (!config || Object.keys(config.tagProperties).length === 0) {
    return { nodes: [], edges: [], budgetClamped: false };
  }
  const materialize = config.materializeTagNodes ?? true;
  const maxPairwise = config.maxPairwiseTagDegree ?? 25;
  const minWeight = config.minTagWeight ?? 2;
  const maxEdges = config.maxEdges ?? 50_000;

  const membersByTag = collectMembersByTag(state, source, nodeIds, config.tagProperties);

  const hubNodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  let budgetClamped = false;

  for (const [tag, members] of membersByTag) {
    if (members.length < minWeight) continue;

    const pairwiseCost = (members.length * (members.length - 1)) / 2;
    const useHub =
      materialize ||
      members.length > maxPairwise ||
      edges.length + pairwiseCost > maxEdges;
    if (!materialize && useHub && members.length <= maxPairwise) budgetClamped = true;

    if (useHub) {
      hubNodes.push(createTagHub(tag, source));
      const hubId = makeTagNodeId(tag);
      for (const memberId of members) {
        addEdge(edges, seen, hubId, memberId, tag, HUB_STRENGTH);
      }
    } else {
      for (let i = 0; i < members.length; i += 1) {
        for (let j = i + 1; j < members.length; j += 1) {
          addEdge(edges, seen, members[i], members[j], tag, PAIRWISE_STRENGTH);
        }
      }
    }
  }

  return { nodes: hubNodes, edges, budgetClamped };
}

function collectMembersByTag(
  state: NotionState,
  source: string,
  nodeIds: ReadonlySet<NodeId>,
  tagProperties: Record<string, string>,
): Map<string, NodeId[]> {
  const membersByTag = new Map<string, NodeId[]>();
  for (const page of Object.values(state.pages)) {
    const tagPropertyId = tagProperties[page.databaseId];
    if (!tagPropertyId) continue;
    const nodeId = makeRecordNodeId(source, page.databaseId, page.id);
    if (!nodeIds.has(nodeId)) continue;

    for (const tag of arrayValue(page.properties[tagPropertyId])) {
      const bucket = membersByTag.get(tag);
      if (bucket) bucket.push(nodeId);
      else membersByTag.set(tag, [nodeId]);
    }
  }
  return membersByTag;
}

function createTagHub(tag: string, source: string): GraphNode {
  return {
    id: makeTagNodeId(tag),
    kind: "tag",
    databaseId: null,
    source,
    label: tag,
    group: null,
    weight: 0,
    version: 0,
    hasNote: false,
  };
}

function addEdge(
  edges: GraphEdge[],
  seen: Set<string>,
  a: NodeId,
  b: NodeId,
  tag: string,
  strength: number,
): void {
  if (a === b) return;
  const id = makeEdgeId(a, b, "tag", tag, false);
  if (seen.has(id)) return;
  seen.add(id);
  edges.push({ id, source: a, target: b, kind: "tag", label: tag, strength, directed: false });
}

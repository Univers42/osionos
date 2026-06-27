/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   relationEdges.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { NotionState, SchemaProperty } from "@notion-db/contract-types";
import { type GraphEdge, type NodeId, makeEdgeId, makeRecordNodeId } from "../graphModel";
import { arrayValue } from "../value";

/**
 * Intra-database relation edges from `relation`-typed schema properties — the
 * Postgres-FK / Notion-relation case. Generalized from the original
 * `createRelationLinks`/`addRelationLink`, but emitting the new typed
 * `GraphEdge` against BaaS-style global node ids.
 *
 * Note: for the BaaS-backed model, cross-database links primarily come from the
 * explicit `edges` mount (`explicitEdges.ts`). These relation edges cover links
 * a backend schema already declares.
 */

const TWO_WAY_STRENGTH = 1.8;
const ONE_WAY_STRENGTH = 1.2;

export function relationEdges(
  state: NotionState,
  source: string,
  nodeIds: ReadonlySet<NodeId>,
): GraphEdge[] {
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];

  for (const page of Object.values(state.pages)) {
    const database = state.databases[page.databaseId];
    if (!database) continue;
    const sourceNodeId = makeRecordNodeId(source, page.databaseId, page.id);
    if (!nodeIds.has(sourceNodeId)) continue;

    for (const property of Object.values(database.properties)) {
      if (property.type !== "relation") continue;
      const targetDatabaseId = property.relationConfig?.databaseId;
      if (!targetDatabaseId) continue;

      for (const targetRecordId of arrayValue(page.properties[property.id])) {
        const targetNodeId = makeRecordNodeId(source, targetDatabaseId, targetRecordId);
        addEdge(edges, seen, sourceNodeId, targetNodeId, property, nodeIds);
      }
    }
  }

  return edges;
}

function addEdge(
  edges: GraphEdge[],
  seen: Set<string>,
  sourceNodeId: NodeId,
  targetNodeId: NodeId,
  property: SchemaProperty,
  nodeIds: ReadonlySet<NodeId>,
): void {
  if (sourceNodeId === targetNodeId || !nodeIds.has(targetNodeId)) return;
  const directed = property.relationConfig?.type !== "two_way";
  const id = makeEdgeId(sourceNodeId, targetNodeId, "relation", property.name, directed);
  if (seen.has(id)) return;
  seen.add(id);
  edges.push({
    id,
    source: sourceNodeId,
    target: targetNodeId,
    kind: "relation",
    label: property.name,
    strength: directed ? ONE_WAY_STRENGTH : TWO_WAY_STRENGTH,
    directed,
  });
}

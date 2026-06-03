/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   explicitEdges.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { type GraphEdge, type NodeId, makeEdgeId } from "../graphModel";
import { edgeKindFromType } from "./edgeKind";

/**
 * The PRIMARY edge source for the BaaS-backed graph (doc 02 §0, doc 03).
 *
 * A relationship is one row in a dedicated `edges` mount whose `from`/`to` are
 * global node ids (`<mount>:<resource>:<pk>`). Because the row lives in a single
 * backend, creating a cross-database link is a single-row, Tier-0 atomic write —
 * the cross-DB-ness is in the edge's *content*, not in a distributed write.
 *
 * This pure function only transforms already-fetched edge rows into typed
 * `GraphEdge`s (keeping edges whose endpoints exist). The BaaS fetch/write
 * wiring lands with the transaction layer (doc 02), not here.
 */

/** A row as stored in the BaaS `edges` mount. */
export interface ExplicitEdgeRecord {
  id?: string;
  from: NodeId;
  to: NodeId;
  /** Free-form relationship type, e.g. 'relates_to', 'blocks', 'note_link'. */
  type?: string;
  label?: string;
  directed?: boolean;
  strength?: number;
}

export function explicitEdges(
  records: readonly ExplicitEdgeRecord[],
  nodeIds: ReadonlySet<NodeId>,
): GraphEdge[] {
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];

  for (const record of records) {
    if (record.from === record.to) continue;
    if (!nodeIds.has(record.from) || !nodeIds.has(record.to)) continue;

    const kind = edgeKindFromType(record.type);
    const label = record.label ?? record.type ?? "linked";
    const directed = record.directed ?? false;
    const id = makeEdgeId(record.from, record.to, kind, label, directed);
    if (seen.has(id)) continue;
    seen.add(id);

    edges.push({
      id,
      source: record.from,
      target: record.to,
      kind,
      label,
      strength: record.strength ?? 1.5,
      directed,
    });
  }

  return edges;
}

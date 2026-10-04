/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   accumulateGraph.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { type GraphModel, type GraphNode, indexModel } from "../model/graphModel";
import { applyDegreeWeights } from "../model/weights";

/**
 * Merge a freshly-fetched neighborhood into the accumulated graph for
 * expand-on-demand (doc 04 fetch strategy): the `/graph/overview` gives the
 * initial bounded view, then each focus `/graph` call adds its neighbors. Newer
 * nodes/edges win (fresher data); weights are recomputed over the union. Pure —
 * inputs are not mutated (nodes are cloned before weight assignment).
 */
export function accumulateGraph(previous: GraphModel, addition: GraphModel): GraphModel {
  const nodeById = new Map<string, GraphNode>();
  for (const node of previous.nodeById.values()) nodeById.set(node.id, { ...node });
  for (const node of addition.nodeById.values()) nodeById.set(node.id, { ...node });

  const edgeById = new Map(previous.edgeById);
  for (const edge of addition.edgeById.values()) edgeById.set(edge.id, edge);

  const nodes = [...nodeById.values()];
  const edges = [...edgeById.values()];
  applyDegreeWeights(nodes, edges);
  return indexModel(nodes, edges);
}

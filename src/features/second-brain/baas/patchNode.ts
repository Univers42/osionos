/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   patchNode.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { type GraphModel, type NodeId, indexModel } from "../model/graphModel";

/**
 * Optimistically apply field changes to one node and return a new `GraphModel`
 * (doc 02 optimistic apply). Edges are untouched, so this is a non-structural
 * change — `diffGraph` reports no add/remove and the layout never reheats; only
 * the affected node redraws. Used for both the optimistic write and its revert.
 */

const LABEL_FIELDS = ["title", "name", "label", "heading", "subject"];

export function patchNodeFields(
  model: GraphModel,
  nodeId: NodeId,
  changes: Record<string, unknown>,
): GraphModel {
  const node = model.nodeById.get(nodeId);
  if (!node) return model;

  const updated = { ...node, fields: { ...node.fields, ...changes } };
  for (const field of LABEL_FIELDS) {
    const value = changes[field];
    if (typeof value === "string" && value.length > 0) {
      updated.label = value;
      break;
    }
  }
  const nodes = model.nodes.map((candidate) => (candidate.id === nodeId ? updated : candidate));
  return indexModel(nodes, model.edges);
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   notePatch.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  type GraphEdge,
  type GraphModel,
  type GraphNode,
  type NodeId,
  indexModel,
  makeEdgeId,
} from "../model/graphModel";
import { applyDegreeWeights } from "../model/weights";
import { parseNodeId } from "./buildRecordTxn";

/**
 * Pure optimistic helpers for the Phase 5 promote/demote flow (doc 06). They add
 * or remove a note overlay node + its `note_of` edge and toggle the source
 * record's `hasNote`, returning a new `GraphModel`. Used for the immediate echo
 * and its revert; structurally consistent with what the next `/graph` fetch
 * returns, so the view converges.
 */

export interface PromoteEcho {
  overlayNodeId: NodeId;
  body: string;
  sourceNodeId: NodeId;
  edgeRecordId: string;
}

export function applyPromote(model: GraphModel, echo: PromoteEcho): GraphModel {
  const ref = parseNodeId(echo.overlayNodeId);
  const overlay: GraphNode = {
    id: echo.overlayNodeId,
    kind: "note",
    databaseId: ref.resource,
    source: ref.mount,
    label: noteLabel(echo.body),
    group: null,
    weight: 0.4,
    version: 0,
    hasNote: false,
    fields: { id: ref.pk, body: echo.body },
  };
  const edge: GraphEdge = {
    id: makeEdgeId(echo.overlayNodeId, echo.sourceNodeId, "note_of", "note_of", false),
    source: echo.overlayNodeId,
    target: echo.sourceNodeId,
    kind: "note_of",
    label: "note_of",
    strength: 0.9,
    directed: false,
    recordId: echo.edgeRecordId,
  };

  const nodes = model.nodes.map((node) => (node.id === echo.sourceNodeId ? { ...node, hasNote: true } : node));
  nodes.push(overlay);
  const edges = [...model.edges, edge];
  applyDegreeWeights(nodes, edges);
  return indexModel(nodes, edges);
}

export function applyDemote(model: GraphModel, overlayNodeId: NodeId, sourceNodeId: NodeId): GraphModel {
  const nodes = model.nodes.filter((node) => node.id !== overlayNodeId);
  const edges = model.edges.filter(
    (edge) => !(edge.kind === "note_of" && edge.source === overlayNodeId && edge.target === sourceNodeId),
  );
  const stillAnnotated = edges.some((edge) => edge.kind === "note_of" && edge.target === sourceNodeId);
  const next = nodes.map((node) =>
    node.id === sourceNodeId && !stillAnnotated ? { ...node, hasNote: false } : node,
  );
  applyDegreeWeights(next, edges);
  return indexModel(next, edges);
}

function noteLabel(body: string): string {
  const firstLine = body.split("\n")[0].trim();
  if (!firstLine) return "Note";
  return firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine;
}

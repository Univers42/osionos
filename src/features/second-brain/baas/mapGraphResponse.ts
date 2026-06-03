/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mapGraphResponse.ts                                :+:      :+:    :+:   */
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
import { edgeKindFromType } from "../model/edges/edgeKind";
import { applyDegreeWeights } from "../model/weights";
import type { BaasGraphNode, BaasGraphResponse, GraphGuarantee } from "./types";

/**
 * Pure boundary: a BaaS `GraphResponse` → our internal `GraphModel` (doc 02 §0,
 * baas-graph-endpoint.md). Maps `from/to → source/target`, derives `EdgeKind`
 * from the wire `type` (explicit + generator types), materializes unresolved
 * placeholder nodes for dangling generated targets (Obsidian-style), and surfaces
 * the honest `guarantee`. No network — unit-tested against a fixture so it drops
 * onto the live endpoint unchanged.
 */

export interface MappedGraph {
  model: GraphModel;
  guarantee: GraphGuarantee;
}

export interface MapOptions {
  /** Resource (table/collection) names whose rows are notes → note-colored. */
  noteResources?: ReadonlySet<string>;
  /** Current user id: hide OTHER users' private notes (per-user privacy POV). */
  viewerId?: string | null;
  /**
   * The note row ids (`osio-note-<pageId>`) that exist in the viewer's page store
   * = the sidebar. When provided, the graph's note layer is filtered to EXACTLY
   * this set, so graph notes mirror the sidebar (others' shared/public notes and
   * stale rows in og_notes are not shown). Takes precedence over `viewerId`.
   */
  liveNoteIds?: ReadonlySet<string>;
}

const LABEL_FIELDS = ["title", "name", "label", "heading", "subject"];
const DEFAULT_EDGE_STRENGTH = 1.4;
// Hierarchy (parent) edges spring harder so a child sits close to its parent,
// making the recursive note forest read as a tree rather than scattered nodes.
const HIERARCHY_EDGE_STRENGTH = 3.2;
const EMPTY_SET: ReadonlySet<string> = new Set();

export function mapGraphResponse(response: BaasGraphResponse, options: MapOptions = {}): MappedGraph {
  const noteResources = options.noteResources ?? EMPTY_SET;
  const nodeById = new Map<NodeId, GraphNode>();
  for (const wire of response.nodes) nodeById.set(wire.id, toGraphNode(wire, noteResources));

  const edges: GraphEdge[] = [];
  for (const wire of response.edges) {
    ensurePlaceholder(nodeById, wire.from, noteResources);
    ensurePlaceholder(nodeById, wire.to, noteResources);
    const kind = edgeKindFromType(wire.type);
    const label = wire.label ?? wire.type;
    const directed = wire.directed ?? false;
    edges.push({
      id: makeEdgeId(wire.from, wire.to, kind, label, directed),
      source: wire.from,
      target: wire.to,
      kind,
      label,
      strength: kind === "hierarchy" ? HIERARCHY_EDGE_STRENGTH : DEFAULT_EDGE_STRENGTH,
      directed,
      recordId: wire.id,
    });
  }

  // Phase 5: a `note_of` edge identifies its `from` as a note overlay and marks
  // its `to` record as annotated (note ring). Structural, so no config needed.
  for (const edge of edges) {
    if (edge.kind !== "note_of") continue;
    const overlay = nodeById.get(edge.source);
    if (overlay) overlay.kind = "note";
    const annotated = nodeById.get(edge.target);
    if (annotated) annotated.hasNote = true;
  }

  // Scope the note layer to this viewer (privacy + sidebar parity).
  let visibleEdges = edges;
  const hidden = hiddenNoteIds(nodeById, options);
  if (hidden.size > 0) {
    for (const id of hidden) nodeById.delete(id);
    visibleEdges = edges.filter((edge) => !hidden.has(edge.source) && !hidden.has(edge.target));
  }

  const nodes = [...nodeById.values()];
  applyDegreeWeights(nodes, visibleEdges);
  return { model: indexModel(nodes, visibleEdges), guarantee: response.guarantee };
}

/**
 * Note nodes to hide for this viewer. `liveNoteIds` (the viewer's page store =
 * the sidebar) takes precedence → the graph shows EXACTLY the sidebar's notes, so
 * a shared/public note owned by another user (present in og_notes) is not shown.
 * Falling back to `viewerId`, hide only OTHER users' private notes (privacy POV).
 * Real protection is server-side: with per-user identity, owner-scoped reads never
 * return others' rows; these client filters give the correct view in dev.
 */
function hiddenNoteIds(nodeById: Map<NodeId, GraphNode>, options: MapOptions): Set<NodeId> {
  const hidden = new Set<NodeId>();
  const { liveNoteIds, viewerId } = options;
  for (const node of nodeById.values()) {
    if (node.kind !== "note") continue;
    if (liveNoteIds) {
      const rowId = typeof node.fields?.id === "string" ? node.fields.id : null;
      if (!rowId || !liveNoteIds.has(rowId)) hidden.add(node.id);
    } else if (viewerId !== undefined && node.fields?.visibility === "private" && node.fields?.owner !== viewerId) {
      hidden.add(node.id);
    }
  }
  return hidden;
}

function nodeKind(resource: string, noteResources: ReadonlySet<string>): GraphNode["kind"] {
  if (noteResources.has(resource)) return "note";
  if (resource === "tags") return "tag";
  return "record";
}

function toGraphNode(wire: BaasGraphNode, noteResources: ReadonlySet<string>): GraphNode {
  const kind = nodeKind(wire.resource, noteResources);
  return {
    id: wire.id,
    kind,
    databaseId: wire.resource,
    source: wire.mount,
    label: pickLabel(wire),
    // A note's "group" is its visibility (private/shared/public) so the graph
    // reflects that real attribute (shown as the node's sub-label + in the inspector).
    group: kind === "note" && typeof wire.data.visibility === "string" ? wire.data.visibility : null,
    weight: 0.2,
    version: 0,
    hasNote: typeof wire.note === "string" && wire.note.length > 0,
    fields: wire.data,
  };
}

function pickLabel(wire: BaasGraphNode): string {
  for (const field of LABEL_FIELDS) {
    const value = wire.data[field];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number") return String(value);
  }
  return wire.pk || wire.id;
}

/** Materialize an unresolved node for a dangling edge endpoint. */
function ensurePlaceholder(nodeById: Map<NodeId, GraphNode>, id: NodeId, noteResources: ReadonlySet<string>): void {
  if (nodeById.has(id)) return;
  const [mount = id, resource = "", ...rest] = id.split(":");
  const pk = rest.join(":");
  nodeById.set(id, {
    id,
    kind: nodeKind(resource, noteResources),
    databaseId: resource || null,
    source: mount,
    label: pk || id,
    group: null,
    weight: 0.2,
    version: 0,
    hasNote: false,
  });
}

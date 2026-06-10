/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   graphModel.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Second Brain graph model: a typed, backend-agnostic projection of the
 * canonical state. Nodes are PRIMARILY data records; "note" is one kind among
 * several (doc 01). Positions/pixels live in the layout & render layers, never
 * here — this module is pure data + O(1) indexes.
 *
 * Identity aligns with the BaaS global record id `<mount>:<resource>:<pk>`, so a
 * node keeps the same id across rebuilds (stable layout) and across backends.
 */

/** Global node identity, e.g. `pg_main:tasks:42` or `note:<id>`. */
export type NodeId = string;
/** Deterministic, content-addressed edge identity (see `makeEdgeId`). */
export type EdgeId = string;

/** A node is primarily a data record; `note` is just one kind. */
export type NodeKind = "record" | "note" | "database" | "tag";

export interface GraphNode {
  id: NodeId;
  kind: NodeKind;
  /** Source database/collection (null for free notes & synthetic hubs). */
  databaseId: string | null;
  /** Backend that owns the truth: 'postgresql' | 'mongodb' | 'json' | ... */
  source: string;
  /** Human label (title property / note title / tag value). */
  label: string;
  /** Secondary label shown at high zoom (status/group/category). */
  group: string | null;
  /** Visual weight 0..1 (degree-derived) → radius / LOD priority. */
  weight: number;
  /** Monotonic version for optimistic concurrency (doc 02); 0 when unknown. */
  version: number;
  /** True if a note overlay exists for this record (doc 06). */
  hasNote: boolean;
  /** Page icon as a raw IconValue string ("🚀" | "emoji:…" | "icon:…" | "img:…"). */
  icon?: string;
  /** Lazily-hydrated property snapshot for the inspector; NOT used for layout. */
  fields?: Record<string, unknown>;
}

export type EdgeKind = "relation" | "tag" | "note_of" | "note_link" | "hierarchy";

export interface GraphEdge {
  id: EdgeId;
  source: NodeId;
  target: NodeId;
  kind: EdgeKind;
  /** Relation/property name or tag value, for labels & filtering. */
  label: string;
  /** Layout pull 0..1-ish; rendered direction is `directed`. */
  strength: number;
  directed: boolean;
  /** Backing edge-row id from the BaaS `edges` mount (for delete/demote). */
  recordId?: string;
}

/** The whole projection plus the indexes the rest of the app needs. */
export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeById: Map<NodeId, GraphNode>;
  edgeById: Map<EdgeId, GraphEdge>;
  /** nodeId → edgeIds touching it (neighborhood/focus in O(degree)). */
  adjacency: Map<NodeId, EdgeId[]>;
  /** databaseId → nodeIds (cluster filters, legend counts). */
  byDatabase: Map<string, NodeId[]>;
  stats: { nodes: number; edges: number; databases: number; notes: number };
}

/** Incremental change between two models (doc 01 §6). */
export interface GraphPatch {
  addedNodes: GraphNode[];
  updatedNodes: GraphNode[];
  removedNodeIds: NodeId[];
  addedEdges: GraphEdge[];
  removedEdgeIds: EdgeId[];
}

/** Build a record node id from the BaaS-style coordinates. */
export function makeRecordNodeId(source: string, databaseId: string, recordId: string): NodeId {
  return `${source}:${databaseId}:${recordId}`;
}

/** Build a (free or overlay) note node id. */
export function makeNoteNodeId(noteId: string): NodeId {
  return `note:${noteId}`;
}

/** Build a synthetic tag-hub node id. */
export function makeTagNodeId(tagValue: string): NodeId {
  return `tag:${tagValue}`;
}

/**
 * Deterministic edge id. Directed edges keep their orientation; undirected ones
 * sort their endpoints so A–B and B–A collapse to a single edge.
 */
export function makeEdgeId(
  source: NodeId,
  target: NodeId,
  kind: EdgeKind,
  label: string,
  directed: boolean,
): EdgeId {
  const endpoints = directed
    ? `${source}->${target}`
    : [source, target].sort((a, b) => a.localeCompare(b)).join("--");
  return `${endpoints}:${kind}:${label}`;
}

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
    a.hasNote === b.hasNote &&
    a.icon === b.icon
  );
}

/**
 * Assemble a `GraphModel` from raw nodes + edges in a single O(N + E) pass:
 * de-dupes nodes/edges by id, drops dangling edges, and builds every index.
 */
export function indexModel(rawNodes: GraphNode[], rawEdges: GraphEdge[]): GraphModel {
  const nodeById = new Map<NodeId, GraphNode>();
  for (const node of rawNodes) {
    if (!nodeById.has(node.id)) nodeById.set(node.id, node);
  }

  const edgeById = new Map<EdgeId, GraphEdge>();
  const adjacency = new Map<NodeId, EdgeId[]>();
  for (const edge of rawEdges) {
    if (edgeById.has(edge.id)) continue;
    // Drop edges pointing at nodes we don't have (keeps the model consistent).
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    edgeById.set(edge.id, edge);
    pushAdjacency(adjacency, edge.source, edge.id);
    pushAdjacency(adjacency, edge.target, edge.id);
  }

  const byDatabase = new Map<string, NodeId[]>();
  let notes = 0;
  for (const node of nodeById.values()) {
    if (node.kind === "note") notes += 1;
    if (node.databaseId != null) {
      const bucket = byDatabase.get(node.databaseId);
      if (bucket) bucket.push(node.id);
      else byDatabase.set(node.databaseId, [node.id]);
    }
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

function pushAdjacency(adjacency: Map<NodeId, EdgeId[]>, nodeId: NodeId, edgeId: EdgeId): void {
  const bucket = adjacency.get(nodeId);
  if (bucket) bucket.push(edgeId);
  else adjacency.set(nodeId, [edgeId]);
}

/**
 * The canonical graph data contract for @osionos/graph-engine.
 *
 * This is a typed, backend-agnostic projection: nodes are PRIMARILY data records
 * ("note"/"tag"/"database" are other kinds), and identity aligns with the BaaS
 * global record id `<mount>:<resource>:<pk>` so a node keeps the same id across
 * rebuilds (stable layout) and across backends. Pixels/positions live in the
 * layout & render layers, never here — this module is pure data + O(1) indexes.
 *
 * Aligned with apps/grobase/wiki/integrations/graph-contract.md. The host app builds a GraphModel
 * (from BaaS or NotionState) and hands it in; the engine never fetches anything.
 */

/** Global node identity, e.g. `pg_main:tasks:42` or `note:<id>`. */
export type NodeId = string;
/** Deterministic, content-addressed edge identity (see `makeEdgeId`). */
export type EdgeId = string;

/** A node is primarily a data record; `note` is just one kind. */
export type NodeKind = "record" | "note" | "database" | "tag";

/** Relationship flavor — drives link color, dash pattern and base thickness. */
export type EdgeKind = "relation" | "tag" | "note_of" | "note_link" | "hierarchy";

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
  /** Monotonic version for optimistic concurrency; 0 when unknown. */
  version: number;
  /** True if a note overlay exists for this record. */
  hasNote: boolean;
  /** Page icon as a raw IconValue string ("🚀" | "emoji:…" | "icon:…" | "img:…"). */
  icon?: string;
  /** Lazily-hydrated property snapshot for the inspector; NOT used for layout. */
  fields?: Record<string, unknown>;
}

export interface GraphEdge {
  id: EdgeId;
  source: NodeId;
  target: NodeId;
  kind: EdgeKind;
  /** Relation/property name or tag value, for labels & filtering. */
  label: string;
  /** Relationship strength 0..1-ish → layout pull AND rendered thickness. */
  strength: number;
  directed: boolean;
  /** Backing edge-row id from the BaaS `edges` mount (for delete/demote). */
  recordId?: string;
}

/** The whole projection plus the indexes the engine and console need. */
export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeById: Map<NodeId, GraphNode>;
  edgeById: Map<EdgeId, GraphEdge>;
  /** nodeId → edgeIds touching it (neighborhood/focus in O(degree)). */
  adjacency: Map<NodeId, EdgeId[]>;
  /** databaseId → nodeIds (cluster filters, legend counts). */
  byDatabase: Map<string, NodeId[]>;
  stats: GraphStats;
}

export interface GraphStats {
  nodes: number;
  edges: number;
  databases: number;
  notes: number;
}

/** Incremental change between two models. */
export interface GraphPatch {
  addedNodes: GraphNode[];
  updatedNodes: GraphNode[];
  removedNodeIds: NodeId[];
  addedEdges: GraphEdge[];
  removedEdgeIds: EdgeId[];
}

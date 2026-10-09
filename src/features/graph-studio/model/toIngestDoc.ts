/**
 * The one boundary between the bridge's graph (`GET /api/graph/pages|data`) and the
 * `<graph-studio>` element's ingest document (graph_render `IngestDoc` version 1, at
 * groot's pinned apps/graph_render). Pure, and relative imports only: groot's C7 check
 * imports this file straight from the submodule.
 *
 * The element refuses a whole document for one duplicate id or one dangling endpoint,
 * and the bridge can send both (`mergeGraphs` keeps dangling ends; scoping cuts edges),
 * so both are dropped here first and counted. Every member is written out, so the
 * element fills no default and reports no note.
 */

/** A bridge node: `<mount>:<resource>:<pk>` and the row fields the bridge copies in. */
export interface BridgeNode {
  id: string;
  mount?: string;
  resource?: string;
  pk?: string;
  data?: Record<string, unknown>;
}

/** A bridge edge. Page `parent` edges run from the child to its parent. */
export interface BridgeEdge {
  id?: string;
  from: string;
  to: string;
  type?: string;
  label?: string;
}

export interface BridgeGraph {
  nodes?: BridgeNode[];
  edges?: BridgeEdge[];
}

export type IngestNodeKind = "record" | "note" | "database" | "tag";
export type IngestEdgeKind = "relation" | "tag" | "note_of" | "note_link" | "hierarchy";

export interface IngestNode {
  id: string;
  kind: IngestNodeKind;
  database_id: string | null;
  source: string;
  label: string;
  group: string | null;
  weight: number;
  version: number;
  has_note: boolean;
  icon: string | null;
}

export interface IngestEdge {
  id: string;
  source: string;
  target: string;
  kind: IngestEdgeKind;
  label: string;
  strength: number;
  directed: boolean;
  record_id: string | null;
  child_first: boolean;
}

export interface IngestDoc {
  version: 1;
  nodes: IngestNode[];
  edges: IngestEdge[];
}

export interface Dropped {
  dupNodes: number;
  dupEdges: number;
  dangling: number;
}

export interface Adapted {
  doc: IngestDoc;
  dropped: Dropped;
}

/** The resources whose nodes are osionos pages (the note layer). */
export const PAGE_RESOURCES: readonly string[] = ["osionos_pages", "folders"];
const TAG_RESOURCE = "tags";
const SOURCE = "osionos";
const WEIGHT = 0.5;
const STRENGTH = 0.5;

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function nodeKind(resource: string): IngestNodeKind {
  if (resource === TAG_RESOURCE) return "tag";
  return PAGE_RESOURCES.includes(resource) ? "note" : "record";
}

/** `updatedAt` as epoch ms (the element reads `version` as an f64), or 0. */
function versionOf(value: unknown): number {
  const ms = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? ms : 0;
}

function toNode(node: BridgeNode): IngestNode {
  const resource = node.resource ?? "";
  const data = node.data ?? {};
  const kind = nodeKind(resource);
  return {
    id: node.id,
    kind,
    database_id: text(resource),
    source: SOURCE,
    label: text(data.title) ?? text(data.name) ?? text(node.pk) ?? node.id,
    group: kind === "note" ? text(data.kind) ?? resource : text(resource),
    weight: WEIGHT,
    version: versionOf(data.updatedAt),
    has_note: kind === "note",
    icon: text(data.icon),
  };
}

/**
 * The legacy `edgeKind` table, copied rather than imported (the new graph has no legacy
 * import), plus the direction. graph_render reads only an exact `child_of` as child-first
 * (`crates/graph-core/src/edgekind.rs` `child_first_from_type`), so a bridge `parent`
 * edge, which runs child → parent, must say so or the tree is drawn upside down.
 */
function edgeShape(type: string | undefined): { kind: IngestEdgeKind; childFirst: boolean } {
  const lowered = (type ?? "").toLowerCase();
  if (lowered === "parent" || lowered === "child_of") return { kind: "hierarchy", childFirst: true };
  if (lowered === "parent_of" || lowered.includes("hierarchy")) return { kind: "hierarchy", childFirst: false };
  if (lowered.includes("note_link") || lowered === "links_to") return { kind: "note_link", childFirst: false };
  if (lowered.includes("note_of") || lowered === "annotates") return { kind: "note_of", childFirst: false };
  if (lowered.includes("tag")) return { kind: "tag", childFirst: false };
  return { kind: "relation", childFirst: false };
}

function edgeId(edge: BridgeEdge): string {
  return text(edge.id) ?? `${edge.from}->${edge.to}:${edge.type ?? ""}`;
}

function toEdge(edge: BridgeEdge): IngestEdge {
  const { kind, childFirst } = edgeShape(edge.type);
  return {
    id: edgeId(edge),
    source: edge.from,
    target: edge.to,
    kind,
    label: text(edge.label) ?? text(edge.type) ?? kind,
    strength: STRENGTH,
    directed: kind === "hierarchy",
    record_id: null,
    child_first: childFirst,
  };
}

/** Bridge graph → ingest document, with what had to be dropped to make it loadable. */
export function toIngestDoc(graph: BridgeGraph | null | undefined): Adapted {
  const dropped: Dropped = { dupNodes: 0, dupEdges: 0, dangling: 0 };
  const nodes = new Map<string, IngestNode>();
  for (const node of graph?.nodes ?? []) {
    if (text(node?.id) === null) continue;
    if (nodes.has(node.id)) dropped.dupNodes += 1;
    else nodes.set(node.id, toNode(node));
  }
  const edges = new Map<string, IngestEdge>();
  for (const edge of graph?.edges ?? []) {
    const shaped = toEdge(edge);
    if (edges.has(shaped.id)) dropped.dupEdges += 1;
    else if (!nodes.has(shaped.source) || !nodes.has(shaped.target)) dropped.dangling += 1;
    else edges.set(shaped.id, shaped);
  }
  return { doc: { version: 1, nodes: [...nodes.values()], edges: [...edges.values()] }, dropped };
}

/** The page id behind a page node (`osionos:osionos_pages:<id>`), or null for any other node. */
export function pageIdOf(nodeId: string): string | null {
  const prefix = "osionos:osionos_pages:";
  if (!nodeId.startsWith(prefix)) return null;
  return text(nodeId.slice(prefix.length));
}

/** The node id the bridge gives a page. */
export function pageNodeId(pageId: string): string {
  return `osionos:osionos_pages:${pageId}`;
}

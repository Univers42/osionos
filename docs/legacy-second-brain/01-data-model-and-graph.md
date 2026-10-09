# Second Brain — Data Model & Graph Projection (01 / 8)

> Owns the **pure projection** layer: turning the canonical `NotionState` into a
> typed `GraphModel` (nodes + edges + indexes), incrementally and cheaply.
> No rendering, no physics, no I/O here — this layer is deterministic and
> unit-testable in isolation.

---

## 1. Inputs we already have

The canonical state (`NotionState` from `@notion-db/object-database`, surfaced by
[`useKnownDatabaseStateStore`](../../src/widgets/database-view/model/knownDatabaseState.ts))
gives us, today, everything the projection needs:

```ts
// shape (abridged) of what we read — DO NOT redefine, import the real types
interface NotionState {
  databases: Record<string, {
    name: string;
    titlePropertyId: string;
    properties: Record<string, SchemaProperty>;
  }>;
  pages: Record<string, {
    id: string;
    databaseId: string;
    archived?: boolean;
    properties: Record<string /*propId*/, unknown>;
  }>;
}
interface SchemaProperty {
  id: string;
  name: string;
  type: PropertyType;                 // 'relation' | 'select' | 'status' | 'number' | ...
  options?: { value: string }[];
  relationConfig?: { databaseId: string; type?: 'two_way' | 'one_way' };
}
```

The existing [`homeKnowledgeGraphData.ts`](../../src/widgets/home-variants/model/homeKnowledgeGraphData.ts)
already proves the derivation works (`createNode`, `createRelationLinks`). We
**lift and generalize** that logic into `deriveGraph.ts` — keeping its correct
parts (relation-key dedupe, value normalization) and fixing its limits
(hard-coded `DATABASE_KIND` map, full recompute on every change, page-only nodes).

---

## 2. The target graph types (`model/graphModel.ts`)

```ts
/** Stable, backend-agnostic identity for anything drawable. */
// Aligns with the BaaS global record identity: `<mount>:<resource>:<pk>`.
export type NodeId = string;   // e.g. `pg_main:tasks:42`, `mongo_a:projects:abc`, or `note:<id>`
export type EdgeId = string;   // derived, deterministic (see §5)

/** A node is PRIMARILY a data record. "note" is just one kind. */
export type NodeKind =
  | 'record'   // a row from any backend (default; the common case)
  | 'note'     // a promoted/standalone note overlay (doc 06) — different color
  | 'database' // optional cluster hub node (one per database) for grouping
  | 'tag';     // optional materialized tag node (doc 03)

export interface GraphNode {
  id: NodeId;
  kind: NodeKind;
  /** Which database/collection this came from (null for free notes). */
  databaseId: string | null;
  /** Backend that owns the truth: 'postgresql' | 'mongodb' | 'json' | ... */
  source: string;
  /** Human label (title property, or note title). */
  label: string;
  /** Secondary label shown at high zoom (status/group/category). */
  group: string | null;
  /** Visual weight 0..1 (degree- & value-derived) → radius/LOD priority. */
  weight: number;
  /** Monotonic version from the canonical record (optimistic concurrency). */
  version: number;
  /** True if a note overlay exists for this record (doc 06). */
  hasNote: boolean;
  /** Lazily-hydrated property snapshot for the inspector; NOT used for layout. */
  fields?: Record<string, unknown>;
}

export type EdgeKind =
  | 'relation'   // schema relation property (Postgres FK / Notion relation)
  | 'tag'        // synthesized from shared tags / references (Mongo) — doc 03
  | 'note_of'    // note ↔ its source record (doc 06)
  | 'note_link'; // [[wikilink]] between notes (doc 06)

export interface GraphEdge {
  id: EdgeId;
  source: NodeId;
  target: NodeId;
  kind: EdgeKind;
  /** Property/relation name or tag value, for labels & filtering. */
  label: string;
  /** Layout pull 0..1; directed-ness is rendered, not simulated. */
  strength: number;
  directed: boolean;
}

/** The whole projection + the indexes the rest of the app needs. */
export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** id → node, id → edge (O(1) lookup for hit-test, inspector, selection). */
  nodeById: Map<NodeId, GraphNode>;
  edgeById: Map<EdgeId, GraphEdge>;
  /** adjacency: nodeId → edgeIds (neighborhood/focus in O(degree)). */
  adjacency: Map<NodeId, EdgeId[]>;
  /** databaseId → nodeIds (cluster filters, legend counts). */
  byDatabase: Map<string, NodeId[]>;
  stats: { nodes: number; edges: number; databases: number; notes: number };
}
```

Design notes:
- **`weight`, not `size`.** Layout/render derive radius from `weight`; we never
  bake pixels into the model (separation of concerns with doc 04/05).
- **Indexes are part of the model.** Building them once during derive turns every
  hot interaction (hover neighborhood, click inspector, search) into a map
  lookup instead of an array scan — essential at 10k nodes.
- **`fields` is optional & lazy.** Carrying every property of every row into the
  model would bloat memory and defeat structural diffing. The inspector
  hydrates `fields` on demand from the canonical state by id.

---

## 3. Node kinds & coloring (data vs note)

Color is owned by the theme (doc 05), but the *kind* that drives it is decided
here. The contract:

- `record` → colored by its **database** (a generated, stable palette keyed off
  `databaseId`, replacing today's hard-coded `DATABASE_KIND`/`NODE_COLORS`).
- `note` → a single distinct **note color** (per the requirement "notes are
  another color for the database"), regardless of the record it overlays.
- A record that *has* a note (`hasNote === true`) gets a small ring/badge in its
  database color so the data identity is preserved while signaling the overlay.

Replacing the hard-coded map matters: today `DATABASE_KIND` only knows six
seeded databases; any real Postgres/Mongo collection falls back to `"page"`.
The new palette is generated from the live `databaseId` set so **any** backend
table is first-class.

```ts
// model/palette.ts (consumed by theme.ts in doc 05)
export function databaseColor(databaseId: string): string {
  // golden-angle hue rotation keyed by a stable hash → distinct, repeatable
  const hue = (hashString(databaseId) * 137.508) % 360;
  return `oklch(0.62 0.13 ${hue})`;
}
```

---

## 4. Derivation: `deriveGraph(state) → GraphModel`

A single pure function, broken into composable passes:

```ts
export function deriveGraph(
  state: NotionState,
  opts: DeriveOptions,            // which sources, include archived?, tag config (doc 03)
): GraphModel {
  const nodes = collectRecordNodes(state, opts);     // pages → record nodes
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = [
    ...explicitEdges(edgesMount, nodeIds),           // PRIMARY: BaaS `edges` mount — cross-DB links live here (one atomic row each)
    ...relationEdges(state, nodeIds),                // intra-DB FK / relation property (generated)
    ...tagEdges(state, nodes, opts.tagConfig),       // doc 03 (Mongo tags → edge rows)
    ...noteEdges(state, nodes),                      // doc 06
  ];
  applyDegreeWeights(nodes, edges);                  // weight from degree+value
  return indexModel(nodes, edges);                   // build all Maps in one pass
}
```

`indexModel` builds `nodeById`, `edgeById`, `adjacency`, `byDatabase`, and
`stats` in a single linear pass — `O(N + E)`, well within the 50 ms budget for
10k/25k.

`relationEdges` is a direct generalization of the existing
`createRelationLinks`/`addRelationLink` (keep its dedupe via sorted
`source--target:propId` key; two-way relations get higher `strength`, matching
today's `1.8` vs `1.2`).

---

## 5. Deterministic IDs (so diffing & layout stability work)

- `NodeId = ${source}:${databaseId}:${recordId}` (notes: `note:${noteId}`).
- `EdgeId` is content-addressed and order-independent for undirected edges:
  `sortedEndpoints.join('--') + ':' + kind + ':' + label`.

Determinism gives us two free wins:
1. **Layout stability** — the same record keeps the same id across rebuilds, so
   the worker reuses its last `x/y` instead of teleporting (doc 04 §node reuse).
2. **Cheap diffing** — see §6.

---

## 6. Incremental diff (the real performance unlock)

Full recompute is fine on first load (≤50 ms) but **not** per keystroke/edit.
After any canonical-state change we compute a *patch*, not a new graph:

```ts
export interface GraphPatch {
  addedNodes: GraphNode[];
  updatedNodes: GraphNode[];   // same id, changed label/weight/version/hasNote
  removedNodeIds: NodeId[];
  addedEdges: GraphEdge[];
  removedEdgeIds: EdgeId[];
}

export function diffGraph(prev: GraphModel, next: GraphModel): GraphPatch;
```

- The known-state store already debounces and emits whole-state snapshots; we
  derive `next`, diff against `prev`, and ship only the **patch** to the layout
  worker and the renderer.
- Editing one property of one row → typically `{ updatedNodes: [1], … }` → the
  worker nudges one node, the renderer redraws one frame. This is what makes the
  "2 ms incremental" budget real.
- Because ids are deterministic, diff is a set-difference over `nodeById`
  keys + a shallow field compare for `updatedNodes` (same technique as the
  block reconciler we shipped for raw-mode — value-equality, reuse identity).

---

## 7. Selectors (`model/selectors.ts`) — read paths used by UI/render

Pure, memoized, index-backed:

```ts
neighborhood(model, nodeId, depth = 1): { nodeIds: Set, edgeIds: Set }  // focus mode
focusDimming(model, nodeId): (id) => 'active' | 'related' | 'dimmed'    // doc 05
searchIndex(model): MiniSearchLike      // label+group, prefix; rebuilt on patch
filterByDatabase(model, enabledDbIds): GraphModel-view (ids only, no copy)
topByWeight(model, k): NodeId[]         // which labels to draw at low zoom (LOD)
```

`neighborhood` and `focusDimming` replace today's per-render
`relatedNodeIdsFor`/`selectedLinksFor` array scans (O(E) each) with adjacency
lookups (O(degree)).

---

## 8. Testing this layer (no DOM, fast)

- **Golden derive tests:** seed `NotionState` fixtures (reuse the existing
  `mongodb/_notion_state.json`, `relational/_notion_state.json`) → assert node
  count, edge count, specific FK edges, stats.
- **Diff tests:** mutate one property → assert patch has exactly one
  `updatedNode` and zero structural churn.
- **ID determinism tests:** derive twice → identical id sets.
- **Scale test:** synthesize 10k pages + 25k relations → assert `deriveGraph`
  ≤ 50 ms and `diffGraph` after a single edit ≤ 2 ms (perf budget gate, doc 07).

---

## 9. What this unblocks downstream

- doc 03 plugs `tagEdges` in without touching node code.
- doc 04 consumes `GraphModel` + `GraphPatch` (never `NotionState`) — clean seam
  between projection and rendering.
- doc 06 adds `note` nodes + `note_of` edges purely additively.

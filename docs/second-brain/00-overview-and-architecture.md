# Second Brain — Rework Master Plan (00 / Overview & Architecture)

> Status: **Design / not yet implemented.** This is document 0 of 8. It frames
> the rework; the other seven documents each own one pillar in depth.
> Decisions locked with the product owner (2026-06-02): **Canvas2D renderer
> targeting ~10k nodes**, **8 design docs first then implement**, and **ACID is
> owned by the Prismatica BaaS** (backend-agnostic), with osionos consuming a
> transactional contract rather than re-implementing transactions.

---

## 1. The one-sentence vision

> The Second Brain is a **live visual projection of the databases** behind the
> product — every row in Postgres/Mongo/CSV/JSON is a node, every key/relation
> is an edge — and *any* node can be **promoted into a note** without ever
> ceasing to be data.

Three principles fall out of that sentence, and every doc obeys them:

1. **Data-first, notes-second.** Nodes are *records*. A note is an *optional
   overlay* on a record (or a free-standing record in a `notes` collection),
   never a replacement. Users who only want the data never trigger conversion.
2. **The graph is a view, not a store.** It never owns truth. Truth lives in the
   backends, surfaced through the canonical `NotionState`, mediated by the BaaS
   for writes. The graph is a derived, disposable projection.
3. **It must beat Obsidian on two axes at once:** *scale* (10k live DB rows, not
   a few hundred hand-written notes) and *meaning* (edges are real foreign
   keys / relations / tags, not just `[[wikilinks]]`).

---

## 2. What exists today (honest current-state audit)

| Area | Today | Verdict |
|------|-------|---------|
| Data source | Canonical `NotionState` seeded from `mongodb/_notion_state.json`, held in `useKnownDatabaseStateStore` (zustand + localStorage) | Solid foundation, reuse it |
| Backends | `json`, `csv`, `mongodb`, `postgresql`/`relational`, `hardcoded`; each maps into `NotionState` via `_field_map.json` + `stateManager.ts` | Solid, extend it |
| Graph derivation | `createHomeKnowledgeGraph()` in [homeKnowledgeGraphData.ts](../../src/widgets/home-variants/model/homeKnowledgeGraphData.ts) — nodes = pages, edges = relation properties | Reusable logic, wrong home |
| Rendering | `HomeKnowledgeGraph.tsx` — **d3-force + SVG, re-creating every `<g>`/`<line>` React element on every simulation tick** | ❌ Hard perf wall (~few hundred nodes) |
| Layout | d3-force on the main thread, `setNodes([...])` per tick | ❌ Blocks UI during settle |
| ACID | `atomicWriteSync()` of a JSON file | ❌ Not transactional, single-process only |
| Mongo relations | Only edges that already exist as `relation` properties | ❌ No tag/reference synthesis for schemaless data |
| Data → note | `openGraphNodePage()` mints a `second-brain-*` page on click | ⚠️ Crude, lossy, no provenance, no back-sync |
| Visual design | Flat circles, fixed kind→color map, side panel | ⚠️ Functional, not "outstanding" |

**Root performance defect:** the render layer is React-over-SVG and is driven by
the physics tick. At N nodes + M edges, every one of the ~60 ticks/sec triggers
`setNodes`/`setLinks`, which re-renders N+M React elements and re-diffs the DOM.
That is `O((N+M)·ticks)` DOM work — it dies well before 10k nodes. The rework
**decouples physics (worker) from rendering (canvas) from React (chrome only).**

---

## 3. Target architecture (layers)

```
┌──────────────────────────────────────────────────────────────────────┐
│ BACKENDS              Postgres • MongoDB • CSV • JSON • (future: more) │
└───────────────┬──────────────────────────────────────────────────────┘
                │  reads + ACID writes
┌───────────────▼──────────────────────────────────────────────────────┐
│ PRISMATICA BaaS (backend-agnostic)                                     │
│   • /query/v1  (today: single read/create/update/delete)              │
│   • /txn/v1    (NEW: atomic multi-op commit across engines — doc 02)  │
│   • adapter-registry • data-plane-router • permission-engine          │
│   ⇒ THIS is where "ACID across backends" lives. osionos calls it.     │
└───────────────┬──────────────────────────────────────────────────────┘
                │  canonical NotionState (databases→props→pages/rows→relations)
┌───────────────▼──────────────────────────────────────────────────────┐
│ CANONICAL STATE  (notion-database-sys)                                 │
│   stateManager • _field_map.json • relationConfig • known-state store  │
└───────────────┬──────────────────────────────────────────────────────┘
                │  pure projection (no side effects)
┌───────────────▼──────────────────────────────────────────────────────┐
│ GRAPH MODEL  (NEW: src/features/second-brain/model)        — doc 01    │
│   GraphNode[] / GraphEdge[]  +  indexes  +  derive/diff  +  selectors  │
│   relation edges (FK) • tag edges (Mongo) • note-link edges — doc 03   │
└───────────────┬──────────────────────────────────────────────────────┘
                │
        ┌───────┴───────────────────────────┐
        ▼                                    ▼
┌───────────────────────┐       ┌────────────────────────────────────────┐
│ LAYOUT WORKER         │       │ RENDER + INTERACTION (main thread)       │
│ d3-force off-thread   │ x/y   │ Canvas2D scene • quadtree hit-test •     │
│ (doc 04)              │──────►│ viewport cull • LOD • minimap (doc 04/05)│
└───────────────────────┘       └───────────────┬──────────────────────────┘
                                                 │ thin React chrome
                                                 ▼
                                ┌────────────────────────────────────────┐
                                │ REACT UI  inspector • search • legend •  │
                                │ "convert to note" action (doc 05/06)     │
                                └────────────────────────────────────────┘
```

**Key inversion vs today:** React renders only the *chrome* (toolbar, inspector,
legend, minimap container). The graph itself is drawn imperatively to a
`<canvas>` from a scene the worker feeds. React never re-renders per tick.

---

## 4. Where the code will live

New feature module (replaces the `home-variants` graph as the canonical home for
this functionality; the old widget becomes a thin re-export during migration —
see doc 07):

```
src/features/second-brain/
  model/
    graphModel.ts          # GraphNode/GraphEdge types + indexes (doc 01)
    deriveGraph.ts         # NotionState → GraphModel, incremental diff (doc 01)
    edges/
      relationEdges.ts     # FK / relation-property edges (doc 01/03)
      tagEdges.ts          # Mongo tag/reference synthesis (doc 03)
      noteEdges.ts         # note↔data provenance edges (doc 06)
    selectors.ts           # neighborhood, focus, search index (doc 01/05)
  txn/
    baasTxnClient.ts       # /txn/v1 client, optimistic apply + reconcile (doc 02)
    mutationQueue.ts       # ordered, versioned, retryable mutations (doc 02)
  layout/
    layout.worker.ts       # d3-force in a Web Worker (doc 04)
    layoutBridge.ts        # postMessage protocol, transferables (doc 04)
  render/
    CanvasScene.ts         # imperative draw loop, layers, batching (doc 04)
    quadtree.ts            # spatial index for hit-test + cull (doc 04)
    camera.ts              # pan/zoom transform, world↔screen (doc 04)
    theme.ts               # design tokens for nodes/edges (doc 05)
  ui/
    SecondBrainView.tsx    # orchestrator (React chrome only) (doc 04/05)
    NodeInspector.tsx      # record viewer/editor + convert action (doc 05/06)
    GraphToolbar.tsx       # search, filters, layout controls (doc 05)
    Minimap.tsx            # overview navigator (doc 05)
  index.ts
```

---

## 5. Performance budget (the contract every doc is held to)

For the locked **10k-node / ~25k-edge** target on a mid-range laptop:

| Metric | Budget | Enforced in |
|--------|--------|-------------|
| Steady-state frame time (idle/pan/zoom) | ≤ 8 ms (120fps headroom) | doc 04 |
| Frame time while physics settling | ≤ 16 ms (60fps) | doc 04 |
| Main-thread block per layout tick | **0 ms** (layout is in worker) | doc 04 |
| Initial derive (NotionState→GraphModel, 10k) | ≤ 50 ms, off critical path | doc 01 |
| Incremental derive after a single edit | ≤ 2 ms | doc 01 |
| Hit-test (pointer→node) | ≤ 0.2 ms via quadtree | doc 04 |
| Optimistic write echo (UI feels committed) | ≤ 1 frame | doc 02 |
| Memory at 10k/25k | ≤ ~80 MB scene buffers | doc 04 |

These are **budgets, not aspirations** — doc 04 specifies the measurement
harness (`PerformanceObserver` + a dev HUD) that fails CI if a budget regresses.

---

## 6. Document map (the other 7)

| # | Document | Owns | One-line outcome |
|---|----------|------|------------------|
| 01 | `data-model-and-graph.md` | GraphNode/Edge, derivation, diff, indexes | A clean, incremental projection of any backend into a typed graph |
| 02 | `acid-and-baas-transactions.md` | BaaS `/txn/v1`, 2-phase/saga, versioning, osionos client | Cross-backend ACID writes with optimistic UI |
| 03 | `mongodb-relations-and-tagging.md` | Tag/reference edges for schemaless data | Mongo gets meaningful relationships without FKs |
| 04 | `rendering-and-performance.md` | Canvas2D engine, worker layout, culling/LOD | 10k nodes at 60fps, zero per-tick React work |
| 05 | `visual-design-and-interaction.md` | Theme, color (data vs note), focus, minimap, search | "Outstanding & beautiful", beats Obsidian on clarity |
| 06 | `data-to-note-conversion.md` | Promote/demote, provenance, two-way sync | Notes are an overlay on data, reversible and linked |
| 07 | `implementation-roadmap-and-migration.md` | Phasing, build order, flags, tests, risks | A safe, reviewable path from today to the target |

---

## 7. Non-goals (explicit, to keep scope honest)

- **Not** building a new database engine inside osionos. ACID is the BaaS's job.
- **Not** a general 3D graph. 2D Canvas only (3D adds cost, not clarity).
- **Not** replacing the existing table/database-view widget — the graph is a
  *complementary* projection; both read the same canonical state.
- **Not** real-time multi-user CRDT editing in v1 (versioned optimistic
  concurrency is enough; CRDT is a noted future extension in doc 02).

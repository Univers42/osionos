# Second Brain — Rendering & Performance (04 / 8)

> Owns the **engine**. This is where the "1 second to render" class of problem
> is killed for good. Locked decision: **Canvas2D, target ~10k nodes / ~25k
> edges at 60fps, zero per-tick React work.** Physics runs in a Web Worker; the
> main thread only draws and hit-tests.

---

## 1. Why the current approach can't scale (and what replaces it)

Today ([HomeKnowledgeGraph.tsx](../../src/widgets/home-variants/ui/HomeKnowledgeGraph.tsx)):

```
d3-force (main thread) ──tick──► setNodes([...]) / setLinks([...])
                                   └─► React re-renders N <g> + M <line> elements
                                        └─► reconciler diffs, DOM mutates N+M nodes
                                             └─► browser re-lays-out/repaints SVG
```

That's `O((N+M) × ticks)` of React + DOM work, ~60×/sec while settling. SVG also
forces layout/style recalc per element. It collapses in the low hundreds.

Replacement pipeline — three threads of concern, fully decoupled:

```
Web Worker:   d3-force ──(Float32Array x/y)──► postMessage(transfer)
                                                      │  (no React, no DOM)
Main thread:  onMessage ─► CanvasScene.draw(rAF) ──► single <canvas> paint
                                                      │  quadtree for hit-test
React:        renders ONCE (the chrome) ───────────► toolbar / inspector / minimap
```

**React never participates in the animation loop.** Node positions live in typed
arrays, drawn imperatively. This is the single most important architectural
change in the whole rework.

---

## 2. Data layout: typed arrays, not object arrays

For 10k nodes we keep positions in flat `Float32Array`s (cache-friendly,
transferable to/from the worker with zero copy):

```ts
// render/CanvasScene.ts (and mirrored in the worker)
interface SceneBuffers {
  x: Float32Array;            // length N
  y: Float32Array;
  radius: Float32Array;       // derived from node.weight (doc 01)
  colorIndex: Uint16Array;    // index into a palette table (doc 01 §3)
  flags: Uint8Array;          // bit0 hasNote, bit1 isNote, bit2 pending(doc 02)…
  edgeFrom: Uint32Array;      // length E (node indices)
  edgeTo: Uint32Array;
  edgeKind: Uint8Array;       // relation|tag|note_of|note_link
}
```

The `GraphModel` (doc 01, object-shaped, great for logic) is compiled **once**
into these buffers; a `GraphPatch` mutates buffers in place (grow with
amortized doubling). Object model for correctness, typed arrays for speed.

---

## 3. The layout worker (`layout/layout.worker.ts`)

- Runs `d3-force` (`forceManyBody` w/ Barnes–Hut, `forceLink`, `forceCollide`,
  `forceCenter`) exactly like today — but off the main thread.
- Emits positions on a throttle (every rAF-ish, ~16ms), transferring the `x`/`y`
  `Float32Array`s (zero-copy) back; main thread transfers a fresh buffer back.
- **Node reuse / stability:** on a `GraphPatch`, added nodes seed near their
  neighbors' centroid (not random) so the graph doesn't explode; existing nodes
  keep position (deterministic ids from doc 01 make this trivial). This replaces
  today's `createInitialNodes` seeded-angle hack.
- **Alpha management:** reheat (`alphaTarget`) only on structural change or drag;
  settle to 0 and **stop ticking** when stable → idle frames cost ~0 (just
  redraw on interaction). Today's sim runs hot via `restart()` on every drag move.
- **Barnes–Hut `theta`** tuned for 10k; `forceCollide` iterations kept low (1–2)
  because collision is the most expensive force.

```ts
// layout/layoutBridge.ts — protocol
type ToWorker =
  | { t: 'init'; nodes: LayoutNode[]; edges: LayoutEdge[]; opts: ForceOpts }
  | { t: 'patch'; patch: LayoutPatch }
  | { t: 'reheat'; alpha: number }
  | { t: 'pin'; id: NodeId; x: number; y: number }   // drag
  | { t: 'unpin'; id: NodeId }
  | { t: 'stop' };
type FromWorker =
  | { t: 'positions'; x: Float32Array; y: Float32Array; alpha: number } // transferable
  | { t: 'settled' };
```

If `Worker`/`OffscreenCanvas` is unavailable (old browsers/tests), a
main-thread fallback runs the same force code in a `requestIdleCallback` budget —
degraded but correct.

---

## 4. The draw loop (`render/CanvasScene.ts`)

A single `requestAnimationFrame` loop that draws **only when dirty**
(new positions, camera moved, selection changed):

```
draw(now):
  if (!dirty && settled) return            // idle = free
  ctx.setTransform(camera)                 // pan/zoom (doc: camera.ts)
  drawEdges(visibleEdges)                  // batched by kind → few state changes
  drawNodes(visibleNodes)                  // circles via path batching
  drawLabels(labelBudgetNodes)             // LOD-gated (§6)
  drawOverlays(selection, hover, pending)  // thin, on top
  dirty = false
```

Performance techniques, each tied to a budget from doc 00:

- **Viewport culling** — only iterate nodes/edges whose world bounds intersect
  the camera rect. At high zoom you draw dozens, not 10k. The quadtree (§5)
  answers "what's visible" in `O(visible)`.
- **Batching** — group `ctx` calls by style (one `beginPath()` for all nodes of
  a color, one stroke per edge-kind) to minimize canvas state changes, the main
  Canvas2D cost.
- **Device-pixel-ratio aware** — back the canvas at `dpr` but cap at 2 to bound
  fill cost on retina.
- **Edge thinning at scale** — below a zoom threshold, skip `tag`/low-strength
  edges (they're visual noise when zoomed out anyway) → fewer line draws.
- **Dirty-rect option (phase 2)** — if profiling shows full clears dominate, clip
  redraw to the changed region. Not needed for 10k; documented as a lever.

> **OffscreenCanvas (phase 2):** the entire draw loop can be moved into the
> layout worker via `OffscreenCanvas`, so even drawing leaves the main thread.
> v1 keeps draw on main (simpler debugging); the buffer/protocol design above is
> already OffscreenCanvas-ready so the move is non-breaking.

---

## 5. Spatial index & hit-testing (`render/quadtree.ts`)

- A quadtree over node positions, rebuilt incrementally from the patch (or bulk
  on big changes). Used for **both** culling (range query against camera rect)
  and **hit-testing** (nearest-node to pointer).
- Pointer → node in `O(log n)` (~0.2 ms budget) instead of today's per-element
  SVG event handlers (which add N+M DOM listeners — itself a scaling cost).
- One canvas, one set of pointer handlers on it; we compute the hit ourselves.
  This also makes hover-neighborhood highlight cheap (doc 01 `neighborhood`).

---

## 6. Level of Detail (LOD) — how 10k stays legible *and* fast

Driven by camera zoom `z`:

| Zoom | Nodes | Edges | Labels |
|------|-------|-------|--------|
| far (overview) | dots, radius floored, color only | only `relation` edges, thin | none (or only top-K by weight, doc 01 `topByWeight`) |
| mid | circles + note ring/badge | relation + tag (thinned) | labels for hovered/selected neighborhood + high-weight |
| near (focus) | full circles, selection ring | all edges, directed arrowheads | all labels in viewport |

Labels are the most expensive thing to draw (text shaping). The **label budget**
(e.g. ≤150 visible labels) is enforced by `topByWeight` + viewport, so text cost
is bounded regardless of N.

---

## 7. Camera (`render/camera.ts`)

- World↔screen transform (pan `x/y`, `scale`), reused for culling and hit-test
  (generalizes today's `toSvgPoint`/`zoomAt` math, which is already correct).
- Inertial pan + smooth zoom-to-cursor; "fit to view" and "focus node" (animate
  camera to frame a node's neighborhood).
- Keyboard pan/zoom retained (today's `handleGraphKey` is fine, ported).

---

## 8. The performance harness (so budgets don't rot)

- A dev-only **HUD** (toggle with a key) showing: fps, frame time, visible
  node/edge counts, worker tick rate, last derive/diff ms, mutation queue depth.
- `PerformanceObserver` + `performance.measure` around `deriveGraph`,
  `diffGraph`, `draw`, worker tick.
- A **headless perf test** (Playwright, reusing the existing browser-test
  harness) that loads a synthetic 10k/25k fixture and asserts the doc-00 budgets;
  wired into CI as a gate (doc 07). A regression *fails the build*, not a review.

---

## 9. Memory discipline

- Reuse buffers across patches (grow, never per-frame allocate).
- No per-tick object/array creation in the draw loop (today's `[...nodesRef]`
  spread per tick is exactly the kind of allocation we eliminate).
- Tag-hub mode (doc 03) keeps edge counts linear; the edge budget circuit-breaker
  protects the buffers.

---

## 10. Definition of done

- [ ] Worker force layout with transferable `Float32Array` positions + protocol.
- [ ] `CanvasScene` draw loop: cull + batch + dirty-only + dpr cap.
- [ ] Quadtree culling & `O(log n)` hit-test; single canvas pointer handling.
- [ ] LOD with bounded label budget.
- [ ] Camera with zoom-to-cursor, fit, focus-node animation, keyboard nav.
- [ ] Perf HUD + CI perf gate at 10k/25k meeting doc-00 budgets.
- [ ] Main-thread block per layout tick measured at ~0 ms.

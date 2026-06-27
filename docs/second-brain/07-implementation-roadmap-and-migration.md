# Second Brain — Implementation Roadmap & Migration (07 / 8)

> Owns **sequencing**: how we get from today's SVG widget to the target engine
> without a big-bang rewrite, in reviewable slices, each shippable behind a flag
> and each defended by a budget/test gate.

---

## 1. Strategy: strangle, don't rewrite

The existing [HomeKnowledgeGraph.tsx](../../src/widgets/home-variants/ui/HomeKnowledgeGraph.tsx)
keeps working the entire time. We build the new `src/features/second-brain/`
module beside it, behind a feature flag, and cut over only when it meets the
budgets (doc 04) and feature parity. The old widget then becomes a thin
re-export and is deleted in the final phase.

- **Flag:** `VITE_SECOND_BRAIN_V2` (build-time) + a runtime toggle in settings, so
  we can A/B and roll back instantly.
- **Shared seam:** both old and new read the same canonical state + reuse the
  *pure* derivation logic, so there's no data divergence during cutover.

---

## 2. Reuse vs. build (be honest about what's already good)

**Reuse / lift (don't rewrite):**
- Derivation logic from `homeKnowledgeGraphData.ts` (relation dedupe, value
  normalization) → `model/deriveGraph.ts` + `model/edges/relationEdges.ts`.
- Canonical state + loaders (`stateManager`, `pgLoader`, `mongoLoader`,
  `_field_map.json`) — extended (doc 03), not replaced.
- Camera/zoom math (`toSvgPoint`, `zoomAt`, `handleGraphKey`) → `render/camera.ts`.
- The block-reconciler pattern we shipped for raw-mode → `diffGraph` (doc 01).
- Existing browser-test harness → perf gate (doc 04 §8).

**Build new:**
- The whole render/layout/txn split (docs 02/04), typed-array scene, worker,
  quadtree, LOD, inspector, tag synthesis, note overlay.

---

## 3. Phased plan (each phase is independently reviewable & shippable)

### Phase 0 — Foundations (no UI change)
- `model/graphModel.ts`, `deriveGraph.ts`, `relationEdges.ts`, `selectors.ts`,
  `diffGraph` (doc 01). Pure, unit-tested against existing state fixtures.
- **Gate:** derive ≤50 ms, diff ≤2 ms on a synthetic 10k fixture.
- *Risk:* low. *Visible change:* none.

### Phase 1 — Canvas engine (parity, behind flag)
- `layout.worker.ts` + `layoutBridge.ts`, `CanvasScene.ts`, `quadtree.ts`,
  `camera.ts`, `SecondBrainView.tsx` (chrome only) (doc 04).
- Renders the same data as today, but Canvas + worker. Click→inspector,
  pan/zoom/drag parity.
- **Gate:** 60fps + 0ms main-thread tick at 10k/25k (perf HUD + CI gate).
- *Risk:* medium (new engine). *Mitigation:* flag-gated, old widget intact.

### Phase 2 — Visual system & interaction (doc 05)
- `theme.ts` palette (data vs note), focus dimming, minimap, search-fly, legend
  filters, cluster-by-database, inspector v1 (read + relation chips).
- **Gate:** visual QA light/dark; focus interactions hold 60fps at 10k.

### Phase 3 — Writes & ACID (doc 02)
- `baasTxnClient.ts`, `mutationQueue.ts`, optimistic apply + reconcile; inspector
  fields become editable.
- **Gate:** atomic rollback, idempotent retry, conflict auto-merge tests vs mock
  BaaS green. Requires BaaS `/txn/v1` (coordinate with BaaS team early — §5).

### Phase 4 — Mongo relations & tagging (doc 03)
- `tagEdges.ts` + explosion guards, `relations`/tag config in `_field_map.json`,
  `mongoLoader` materialization, relationship-config panel, relationship edits
  via `commitTxn`.
- **Gate:** adversarial scale fixtures stay within edge budget.

### Phase 5 — Data ↔ note conversion (doc 06)
- `NoteMeta` + note-as-page, promote/demote, mirrored-field write-back, bulk
  promote, "file into database". Replaces `openGraphNodePage`.
- **Gate:** promote→demote round-trip lossless; note delete never mutates record.

### Phase 6 — Cutover & cleanup
- Default the flag on; `home-variants/HomeKnowledgeGraph` → thin re-export of
  `SecondBrainView`; delete dead SVG render path after a soak period.
- Update docs; remove the flag once stable.

---

## 4. Dependency graph of the work

```
Phase 0 (model) ─┬─► Phase 1 (engine) ─► Phase 2 (visual) ─► Phase 6 (cutover)
                 │                                   ▲
                 └─► Phase 3 (ACID writes) ──────────┤
                          │                          │
                          └─► Phase 4 (mongo tags) ──┤
                                   │                 │
                                   └─► Phase 5 (notes)┘
```
Phases 0→1→2 are the critical path to a *visible* win (the perf fix). 3/4/5 layer
capability on the stable engine and can partly parallelize once 0 lands.

---

## 5. External dependency: the BaaS `/txn/v1` contract

- **Blocking for Phase 3 only.** Phases 0–2 (the headline perf + visual rework)
  need *no* BaaS change — they're read/projection/render.
- Action: hand doc 02 §3 (the wire contract) to the BaaS team at the start of
  Phase 1 so `/txn/v1` is ready by Phase 3. Until then, writes use the existing
  single-op `/query/v1` for single-field edits (no cross-engine atomicity yet),
  clearly flagged as interim.

---

## 6. Testing & quality gates (per phase, enforced in CI)

| Gate | Tool | Blocks |
|------|------|--------|
| Pure-logic unit tests (derive/diff/edges/selectors) | existing test runner | every PR |
| Perf budgets at 10k/25k (doc 00 table) | Playwright headless + PerfObserver | Phase 1+ |
| Visual regression light/dark | screenshot diff (browser-tests) | Phase 2+ |
| Txn correctness (atomic/idempotent/conflict) | mock BaaS unit tests | Phase 3+ |
| Edge-explosion guards | adversarial fixtures | Phase 4+ |
| Note round-trip & non-destruction | unit + e2e | Phase 5+ |

A regressed perf budget **fails the build** — performance is a feature with a
test, not a vibe.

---

## 7. Risks & mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Worker/transferable complexity | med | main-thread fallback (doc 04 §3); protocol unit-tested |
| BaaS `/txn/v1` slips | med | Phases 0–2 don't need it; interim single-op path |
| Tag explosion on real Mongo data | med | hub-default + degree cap + circuit-breaker (doc 03 §3) |
| Canvas a11y gap vs DOM | med | selected-subgraph DOM mirror + keyboard model (doc 05 §9) |
| Scope creep (3D, CRDT, edge-bundling) | high | explicitly phased/deferred (doc 00 §7, doc 02 §7, doc 05 §3) |
| Cutover regressions | low | flag + old widget intact until soak passes |

---

## 8. Rough sizing (relative, for sequencing — not a commitment)

| Phase | Relative effort | Headline value |
|-------|----------------|----------------|
| 0 model | S | enables everything |
| 1 engine | L | **the perf fix** (the reason we started) |
| 2 visual | M | "beautiful, beats Obsidian" |
| 3 ACID writes | M (+BaaS) | safe editing |
| 4 mongo tags | M | relationships for schemaless data |
| 5 notes | M | the data↔note feature |
| 6 cutover | S | delete the old path |

**Recommended first cut to demo:** Phases 0→1→2 — that alone replaces the slow
SVG graph with a 10k-capable, beautiful Canvas engine and is a self-contained,
shippable win.

---

## 9. Definition of done (whole initiative)

- [ ] New engine default-on; old SVG path deleted.
- [ ] 10k/25k within all doc-00 budgets in CI.
- [ ] Data-first model with reversible, provenance-tracked note overlays.
- [ ] Cross-backend atomic writes via BaaS; Mongo relationships via tags/refs.
- [ ] Light/dark, keyboard, screen-reader-focus support.
- [ ] These 8 docs updated to reflect any decisions made during build.

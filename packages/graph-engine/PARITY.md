# Graph cutover — parity sign-off

Records the shadow→parity→cutover for the osionos relationship graph: the legacy
SVG `HomeKnowledgeGraph` and the Canvas `SecondBrainView` were replaced by
`@osionos/graph-engine` (rendered in the app via `@/widgets/graph-explorer`).
Cutover performed 2026-06-08 on branch `refactor_perf_and_mark`.

## Feature parity (legacy → new)

| Capability | Legacy (SecondBrainView) | New (GraphEngineExplorer) |
|---|---|---|
| Canvas2D + Web-Worker d3-force | ✅ | ✅ (in package) |
| Zoom / pan / node drag | ✅ | ✅ |
| Degree-sized nodes | ✅ (radius 4–19) | ✅ (glassy glow sprite, 5–22) |
| Conditional link thickness | per-kind only | ✅ per-kind **and** per-strength tier |
| Database-colored nodes + legend | ✅ | ✅ (Filters panel) |
| Selection + neighborhood focus dimming | ✅ | ✅ |
| Node inspector + field editing (local + atomic BaaS /txn) | ✅ | ✅ (reuses the same write path) |
| Note promote / demote | ✅ | ✅ |
| Search + fit + reset + zoom buttons | ✅ | ✅ (console) |
| Stats bar + guarantee + offline indicator | ✅ | ✅ |
| Empty-state / retry | ✅ | ✅ |
| BaaS bootstrap retry + snapshot offline + reconnect poll + live-refresh | ✅ | ✅ (`useBaasGraph`) |
| Aggregate "shown of total" | ✅ | ✅ |
| Expand-on-double-click (neighborhood merge) | ✅ | ✅ |
| Minimap (overview + click-recenter) | ✅ | ✅ (package `<Minimap>`) |
| Tag management (show/hide + recolor) | ❌ | ✅ **new** |
| Physics sliders (live charge/distance/collide/gravity/damping, freeze/reheat) | ❌ | ✅ **new** |
| Visual sliders (size/thickness/label LOD/glow/background) | ❌ | ✅ **new** |
| PNG + SVG export | ❌ | ✅ **new** |
| Aurora-glass animated background + reveal animation | ❌ | ✅ **new** |

**Conclusion:** full feature parity, plus a materially richer control surface. No
known functional regression.

## Gates

- **Build (authoritative):** `vite build` green — package + worker + CSS + app
  (incl. the new view) all bundle.
- **Types:** dedicated `tsc -p packages/graph-engine/tsconfig.json` clean; app
  `tsc` clean (only the pre-existing vendored `notion-database-sys` `.js` shebang
  error remains, unrelated).
- **Unit:** `tests/canvas/graph-engine.test.ts` 14/14 green; full canvas suite
  86/87 (the 1 failure is the pre-existing, unrelated `markdown-paste-sample`).
- **e2e/visual:** `graph-engine-visual.spec.mjs` captured the aurora view +
  console + node-select→inspector + focus dimming.
- **a11y:** `graph-engine-audit.spec.mjs` — 0 unnamed interactive controls; canvas
  labeled.
- **perf:** live frame timing avg ≈ 16.4 ms / p95 ≈ 16.8 ms (~61 fps) on the real
  render with seed data.
- **Lighthouse:** app shell (home) 60 / 95 / 96 / 100 — global regression check
  (Lighthouse CLI can't target the localStorage-driven graph variant; the
  view-accurate a11y+perf audit above covers the graph itself).

## Deleted (cutover — last step)

Legacy rendering, replaced by the package (data adapters kept — the new view
reuses `second-brain/model`, `baas`, `sync`, `NodeInspector`):

- `second-brain/ui/{SecondBrainView,Minimap}.tsx`,
  `second-brain/render/{CanvasScene,camera,theme}.ts`,
  `second-brain/layout/{forceLayout,layoutBridge,layout.worker,layoutEngine}.ts`
- `home-variants/ui/{HomeKnowledgeGraph,homeGraph*,useGraphSimulation,homeSecondBrain*}` + `homeKnowledgeGraph.css`,
  `home-variants/model/{homeKnowledgeGraphData,homeKnowledgeGraphValue,homePageTreeGraph}.ts`
- `widgets/graph-explorer/flag.ts` (cutover removed the opt-in flag — the new
  engine is now the only graph), `tests/canvas/second-brain-camera.test.ts`
  (camera moved to the package; covered by `graph-engine.test.ts`).

Revert path: all deletions are in git history on `refactor_perf_and_mark`.

## Visual refinement — "flat constellation" (2026-06-08)

Follow-up pass after live data landed: the nodes read as dated glossy beads. Node
visual language redesigned (decisions: flat constellation, shape + color, full pass):

- **Nodes:** dropped the 0.6 white sheen + black rim + per-node baked glow. Now a dark
  matte backing (legibility on the aurora at any hue) + flat solid core + ≤0.14 sheen +
  crisp light rim. Higher-contrast database hues (`oklch 0.72 / 0.17`).
- **Shape language:** record = filled disc, tag = hollow ring (hub), note = ringed orb.
  Sprites batch by `shape|color` (was color-only) via a shared DOM-free `nodeShape.ts`.
- **Glow** is now a dynamic emphasis pass (`glowPass.ts`): faint on degree hubs
  (decorative → off under reduced motion), bright on hover/selected — not every node.
- **Selection/hover:** bolder rings, and the node is raised above any overlap.
- **Labels:** soft shadow halo (was an opaque "sticker" box); accent labels bolder.
- **Background:** calmer bands (0.2 → 0.13 / calm 0.10) + a vignette; default `aurora-calm`.
- **Legend:** kind chips show the shape glyph (`widgets.tsx`/`FiltersPanel`); SVG export
  reflects shapes (tags as rings).

Gates: `vite build` green; `tsc -p packages/graph-engine` clean; package ESLint (incl.
import firewall) 0 warnings; canvas units **16/16** (2 new: `shapeOf`/`styleKey` +
`styleBuckets`).

Also split the pre-existing `scene.ts` godfile (was 267 ln) into a thin façade
(`scene.ts`, 199 ln) + `sceneCamera.ts` (45, camera/viewport math) + `sceneSelection.ts`
(40, selection/focus index tracking) — all now ≤200 lines / a single class each.

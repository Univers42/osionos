# @osionos/graph-engine

A self-contained, **framework-agnostic** force-directed graph engine for visualizing data
relationships. Built for speed (Canvas2D + a Web-Worker `d3-force` layout) and dressed in an
**aurora-glass** visual language: a drifting indigo→violet background, glassy radial-gradient
nodes whose size grows with their degree, and neon links whose thickness tracks relationship
strength.

It is **decoupled from the host application** like an installed dependency: the engine knows
nothing about BaaS, Notion, routing, or stores. You hand it a `GraphModel` and a `Controls`
object; it renders and emits events. Data sourcing stays in the app.

## Boundary contract (enforced by ESLint)

- `src/core/**` is pure: **no React**, **no `@/…` host-app imports**. Only the data contract,
  layout, rendering, theme, and control state live here.
- `src/react/**` is the only place React appears — a thin adapter (`GraphView`, `GraphConsole`)
  that mounts the core engine into a `<canvas>` and binds the control panels.

## Public API

```ts
import {
  // data contract
  type GraphModel, type GraphNode, type GraphEdge, indexModel, emptyModel,
  // engine (Phase: core)
  // createEngine,
  // react adapter (Phase: react)
  // GraphView, GraphConsole,
} from "@osionos/graph-engine";
```

## Layout

```
src/
  core/        framework-agnostic engine
    types.ts   GraphNode / GraphEdge / GraphModel data contract
    model/     ids + indexing + degree weights + tag/filter helpers
    camera/    world<->screen transform
    layout/    d3-force in a Web Worker, with live physics-param updates
    render/    aurora background, glassy nodes, conditional links, glow, reveal
    theme/     resolve --osio-* tokens + aurora palette
    state/     controls store (filters / physics / visual / search)
  react/       GraphView + GraphConsole + console panels + export
  styles/      graph.css (tokens only — CSP-safe, no inline styles)
```

## Why a package and not a folder

A real package boundary (own `package.json`, `exports`, README, and an import firewall) keeps
the graph swappable and independently testable — it behaves like a plugin you installed, even
though it currently resolves via a Vite alias / tsconfig path rather than `node_modules`.

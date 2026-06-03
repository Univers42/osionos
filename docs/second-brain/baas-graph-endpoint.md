# BaaS `/graph` endpoint — the live contract (cross-team)

> **Canonical source of truth:** `apps/baas/mini-baas-infra` → **`apps/baas/wiki/graph-contract.md`**.
> Maintained on the **BaaS side**; this file is the osionos-facing summary. If a
> type below changes, edit the canonical contract first and ping the BaaS side.
> (Aligns with doc 01 `model/graphModel.ts` and doc 02's ACID reality check.)

## The endpoint (shipped, BaaS query-router)

```
POST /query/v1/graph          (auth: same X-Baas-Api-Key as the rest of /query/v1)
{
  "focus":     "<mount>:<resource>:<pk>",   // required — a BaaS NodeId
  "depth":     1,                           // optional, 0–3, default 1
  "edgesDbId": "<mount id holding edge rows>",// required — the `edges` mount
  "edgesTable":"edges"                      // optional, default "edges"
}
→ 200 GraphResponse  (below)
```

It's pure orchestration over `/v1/query` (BFS: fetch focus → list the `edges`
mount where `from|to == node` → visit peers). **No cross-DB join**; a node the
caller can't read is silently omitted (per-tenant/per-resource ACL is free).

### Global graph (whole-vault view)

```
POST /query/v1/graph/overview
{
  "resources":[ {"dbId":"<m>","table":"notes"}, {"dbId":"<m2>","table":"users"} ],
  "edgesDbId":"<edges mount>", "edgesTable":"edges",
  "limit": 500,                          // rows PER resource (1–2000), bounded
  "generators": { ... }                  // optional, same as below
}
→ 200 GraphResponse  (no `focus`; always guarantee "subgraph_eventual")
```

Use this for the **initial whole-graph render**, then `/graph` (focus) to expand a
node locally. It's **bounded** (samples up to `limit` rows per resource) — don't
treat it as the complete dataset.

## Wire shape (what crosses the network)

```ts
type NodeId = string;                        // <mount>:<resource>:<pk>

interface GraphNode { id: NodeId; mount: string; resource: string; pk: string;
                      data: Record<string, unknown>; note?: string; }

interface EdgeRecord { id: string; from: NodeId; to: NodeId;   // ← NOTE: from/to
                       type: string; label?: string; directed?: boolean; }

interface GraphResponse {
  focus?: NodeId; depth: number;                        // focus absent on /overview
  nodes: GraphNode[]; edges: EdgeRecord[];
  guarantee: 'per_node_atomic' | 'subgraph_eventual';   // honest tier — doc 02
}
```

## Secondary edge generators (shipped, server-side)

Besides the explicit `edges` mount, the request can ask the BaaS to derive edges
from node data — all arrive as normal `EdgeRecord`s, so `deriveGraph` treats them
uniformly. Add under the request body:

```jsonc
"generators": {
  "noteField": "body",                                       // [[NodeId]] → type "note_link"
  "tags":   { "field": "tags", "mount": "<m>", "resource": "tags" },     // string[] → "tagged"
  "references": [ { "field": "author_id", "mount": "<m>", "resource": "users" } ] // value → type = field name
}
```

Edge `type`s you'll see: your explicit types, plus `note_link`, `tagged`, and
`<field-name>` for references. **Generated-edge targets may be dangling** (no row
for that tag/reference) — render them as unresolved nodes (Obsidian does the same).
Live-verified cross-**database** (a Postgres note ↔ a MySQL user in one graph).

## Running BaaS mode in the browser (CORS — now unblocked)

The Kong CORS allow-list now permits **`http://localhost:3001`** and
`http://127.0.0.1:3001` (plus the `X-Baas-Api-Key` header) — so the in-browser
BaaS graph mode works over the plain-http Vite dev server; **no Vite HTTPS needed.**
Uncomment the `VITE_BAAS_*` block in `.env` and run on port **3001**.

- Serving the dev app on a **different port/host**? Ask the BaaS side to add that
  exact origin (it's one line in `docker/services/kong/conf/kong.yml`).
- The gateway base (`VITE_BAAS_URL`) is `http://127.0.0.1:8000` — but the
  orchestrator allocates ports dynamically, so confirm with
  `docker port mini-baas-kong 8000/tcp` if a call ever fails to connect.

## Mapping into the osionos model (`deriveGraph.ts`)

The **wire** uses `from`/`to`; the **osionos internal** `GraphEdge` uses
`source`/`target`. `deriveGraph` is the boundary that maps them:

- `EdgeRecord.from → GraphEdge.source`, `EdgeRecord.to → GraphEdge.target`.
- Explicit edges (the `edges` mount) are the **primary** generator; FK/tag/note
  edges are secondary and must emit the same shape *before* this mapping.
- Surface `GraphResponse.guarantee`: `subgraph_eventual` = possibly slightly stale
  (fine for the view); never imply a global atomic snapshot.

Notes-only nodes (`note:<id>`, not a DB record) are an **osionos-local** layer —
the BaaS endpoint only returns `mount:resource:pk` data-plane nodes; layer note
nodes on top client-side.

## Phase 0 reminder

Phase 0 (`graphModel.ts`/`deriveGraph.ts`/`diffGraph.ts`) is **pure / contract-only**:
build and unit-test against a fixture `GraphResponse` (see graph-contract.md §6) —
you do **not** need the live endpoint; it drops in unchanged at integration time.

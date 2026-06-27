# Second Brain — MongoDB Relations & Tagging (03 / 8)

> Owns **edge synthesis for schemaless backends**. Postgres gives us foreign
> keys for free; MongoDB does not. This doc defines how schemaless documents
> still produce meaningful, beautiful relationships — without forcing users to
> migrate their data.

---

## 1. The asymmetry we're solving

| Backend | Relationship source | Edge derivation |
|---------|--------------------|-----------------|
| PostgreSQL / relational | FK columns mapped in `_field_map.json` (e.g. tasks.`project` → projects.id) and `relation`-typed schema properties | **Already works** — `relationEdges()` (doc 01), generalized from `createRelationLinks` |
| MongoDB | None guaranteed. Documents are free-form; references are by convention | **This doc** — synthesize via tags & reference fields |
| CSV / JSON | Same as Mongo (flat, no enforced relations) | Reuse the Mongo synthesis path |

The product owner's framing, encoded here:
> "for mongodb as it's a system without relations maybe we need a system of tags
> or something to make relationship, or otherwise we don't."

So tagging is **opt-in and additive**: if a Mongo collection declares no
relation hints, it simply renders as unlinked record nodes (still useful — you
see the data). The moment a user adds tags/references, edges appear.

---

## 2. Three ways a Mongo document gets edges (in priority order)

### (a) Declared reference fields — "soft foreign keys"
A field whose value is (or contains) the `_id` of another document, declared in
the field map so it's promoted to a `relation` schema property at load time.

```jsonc
// _field_map.json — add a relations section per database
{
  "db-tasks": {
    "fields": { "prop-title": "title", "prop-status": "status" },
    "relations": [
      { "prop": "prop-project", "field": "projectId", "target": "db-projects", "type": "one_way" }
    ]
  }
}
```

At load (`mongoLoader`), any field listed under `relations` is materialized into
the canonical state as a `relation` property with `relationConfig.databaseId`.
From there it's **indistinguishable from a Postgres FK** — `relationEdges()`
handles both, no graph-side branching. This is the cleanest path and should be
the recommended one.

### (b) Shared tags — "associative edges"
Documents carry a `tags: string[]` (or any array field configured as the tag
field). Two records sharing a tag are *associatively* related. We materialize
this two ways, chosen per config:

- **Tag-hub mode (`materializeTagNodes: true`):** each distinct tag becomes a
  `tag` node (doc 01 `NodeKind`), and every record carrying it links to the hub.
  Great when tags are few and meaningful (e.g. `#q3-launch`) — produces clean
  star clusters, avoids the O(n²) blow-up of pairwise edges.
- **Pairwise mode (`materializeTagNodes: false`):** records sharing a tag link
  directly. Only enabled when a tag's cardinality is below a threshold
  (`maxPairwiseTagDegree`, default 25) to prevent a popular tag from creating
  `C(n,2)` edges. Above the threshold we **force** tag-hub mode for that tag.

```ts
// model/edges/tagEdges.ts
interface TagConfig {
  tagField: string;                 // e.g. 'tags'
  materializeTagNodes: boolean;     // default true for safety/clarity
  maxPairwiseTagDegree: number;     // default 25
  minTagWeight: number;             // ignore tags used <2 times
}
export function tagEdges(state, nodes, cfg?: TagConfig): { nodes: GraphNode[]; edges: GraphEdge[] };
```

`tagEdges` returns *both* nodes (tag hubs) and edges, so `deriveGraph` (doc 01)
just spreads them in. Tag edges use `kind: 'tag'` so the renderer styles them
distinctly (dashed/secondary) from hard relations (doc 05).

### (c) Same-value join keys — "inferred edges" (optional, off by default)
If two collections share a natural key (e.g. both have `email`), we *can* infer
edges. This is powerful but noisy, so it's **opt-in per pair** in config and
clearly labeled as "inferred" in the UI. Documented for completeness; not in v1
default behavior.

---

## 3. Avoiding the combinatorial explosion (the real Mongo risk)

Naive "link everything sharing a tag" is `O(tag_count × C(members,2))` and will
produce millions of edges from a few thousand docs — instantly blowing the
10k/25k budget. Guards (all enforced in `tagEdges`):

1. **Tag-hub by default** → a tag with N members adds N edges, not N²/2.
2. **Degree cap** → pairwise only below `maxPairwiseTagDegree`; else hub.
3. **`minTagWeight`** → singleton tags create no edges (they're metadata, not
   relations).
4. **Edge budget circuit-breaker** → if synthesized edges would exceed a
   configured ceiling, fall back to hub-only and emit a one-time diagnostic so
   the user understands why (surface in the toolbar, doc 05).

These guards are unit-tested with adversarial fixtures (one tag on 5k docs must
yield 5k edges in hub mode, never ~12.5M pairwise).

---

## 4. Writing tags/relations back (atomic, via doc 02)

Creating a relationship from the graph (drag node A onto node B, or "add tag" in
the inspector) is a **write**, so it goes through `commitTxn` (doc 02):

- **Add soft-FK:** `update` op setting `B`'s reference field to `A._id`
  (and, for two-way, `A`'s back-reference) — one atomic txn.
- **Add tag:** `update` op pushing the tag onto the document's tag array; if a
  new tag-hub node results, it's a pure projection effect (no write needed for
  the hub itself — hubs are derived, not stored).
- **Optimistic echo:** the edge appears immediately (doc 02 optimistic apply),
  reconciled on commit.

So the graph is not just a viewer — it's an **editor of relationships**, and
every relationship edit inherits the ACID guarantees from doc 02.

---

## 5. Config surfacing & discovery

- Tag/relation config lives alongside `_field_map.json` per source, so it's
  versioned with the data mapping and identical in spirit to existing loaders.
- A small **"Relationships" panel** (doc 05) lets a user, per Mongo collection:
  declare a reference field as a relation, pick the tag field, toggle tag-hub
  vs pairwise — writing back to the config. This is how a user "turns on"
  relationships for previously-flat data, matching the brief's "create a system
  of tags to make relationship, or otherwise we don't."

---

## 6. Postgres side (for symmetry, mostly already done)

- FK columns are already in `_field_map.json` (e.g. tasks→`project`,
  inventory→`project`, crm→`projects`).
- We add an explicit `relations` declaration (same schema as §2a) so an FK
  column is unambiguously an edge vs a scalar — removing today's reliance on the
  property *type* alone and making the two backends share one code path.

---

## 7. Definition of done

- [ ] `relations` + tag config schema added to `_field_map.json`, read by loaders.
- [ ] `mongoLoader` materializes declared reference fields into `relation` props.
- [ ] `tagEdges()` with hub/pairwise modes + all four explosion guards + tests.
- [ ] Relationship edits route through `commitTxn` (atomic) with optimistic echo.
- [ ] "Relationships" config panel writes back per-collection.
- [ ] Adversarial scale tests (popular tag, many collections) stay within budget.

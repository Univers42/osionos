# BaaS `/txn` endpoint — atomic writes (unblocks Phase 3)

> **Canonical source of truth:** `apps/grobase/infra` → **`apps/grobase/wiki/architecture/contracts/txn-contract.md`**.
> Maintained on the **BaaS side**; this file is the osionos-facing summary. It's
> the write counterpart to `baas-graph-endpoint.md` and aligns with doc 02 (ACID).

## The endpoint (shipped, BaaS query-router)

```
POST /query/v1/txn            (auth: same X-Baas-Api-Key as /query/v1)
{
  "mount": "<dbId>",                       // ALL ops run on this ONE mount
  "operations": [                          // 1..50 write ops, in order
    { "op": "update", "resource": "notes", "filter": {"id":"n1"}, "data": {"title":"…"} },
    { "op": "insert", "resource": "edges", "data": {"id":"e1","from":"…","to":"…","type":"link"} },
    { "op": "delete", "resource": "edges", "filter": {"id":"e9"} }
  ]
}
→ 201 { "guarantee": "atomic", "mount": "<dbId>", "results": [ {op,resource,rowCount}, … ] }
```

- `op` ∈ `insert | update | delete | upsert`. `data` for writes, `filter` for
  update/delete. Ops run **in order**, in one backend transaction.
- **All-or-nothing**: any failure rolls back the whole batch (verified live).
- Engine must be **transactional** (`postgresql`/`mysql`); `mongodb`/`redis`/`http`
  return `400 "engine '<e>' does not support requested capability 'transactions'"`.

## The boundary you must respect (the honest part)

`mount` is **one** mount. **No cross-mount/cross-database atomicity** (that's 2PC,
not offered). For the inspector:

- Edit a **node + its edges atomically only when they share a mount** → one `/txn`
  with the node `update` + edge `insert`/`delete` ops. **Co-locate** the edges
  table in the same mount as the node if you need atomic edge edits.
- If the edges mount differs from the node mount, do separate `/txn` calls and
  treat it as eventually-consistent — surface that to the user the same honest way
  the graph surfaces `subgraph_eventual`. Make those writes idempotent so a retry
  after a partial failure converges.

## Errors

| Status | Meaning | State |
|---|---|---|
| `400` | bad request **or** non-transactional engine | nothing ran |
| `403` | an op is unauthorized (checked before begin) | nothing ran |
| `409` | integrity conflict (dup PK/unique, FK, not-null, check) | **whole batch rolled back** |
| `502` | genuine backend/transport failure | **whole batch rolled back** |

Neither `409` nor `502` is a partial write — read them as "rolled back". A `409`
carries the engine's reason (e.g. `duplicate key value violates unique constraint`),
so the inspector can show "that id already exists" rather than a generic error.
(This applies to plain `/query` inserts too, not just `/txn`.)

## Two gotchas the inspector must handle (verified live)

1. **Writes are owner-scoped.** `update`/`delete` only touch rows your identity
   **owns** (`owner_id` = caller). Records created through the BaaS get `owner_id`
   automatically and are editable; side-loaded rows are read-only to an api-key.
2. **A no-op edit is `201`, not an error.** An `update` that matches nothing (or a
   row you don't own) returns `201 guarantee:"atomic"` with **`rowCount: 0`** — it
   committed but changed nothing. **Your optimistic patch must revert on
   `rowCount === 0`, not only on HTTP error.** (`commitTxn` should surface the
   per-op `rowCount` so the inspector can check it.)

## Phase 5 — promote a record to a note overlay (proven, no new BaaS endpoint)

The data↔note model maps entirely onto `/txn` + `/graph` (live-verified):

- **Promote** (record → note overlay), atomic, one mount:
  ```jsonc
  { "mount": "<pg>", "operations": [
    { "op":"insert", "resource":"overlays", "data":{ "id":"ov1", "body":"…", "color":"violet" } },
    { "op":"insert", "resource":"edges",
      "data":{ "id":"noe1", "from":"<pg>:overlays:ov1", "to":"<pg>:notes:n1", "type":"note_of" } }
  ] }
  ```
  → the overlay node + the `note_of` edge then show up in `/graph` focus on `n1`.
- **Demote** (reverse): one `/txn` that `delete`s the `note_of` edge **and** the
  overlay row → both gone, atomically. Reversible by construction.
- Keep the overlay table **in the same mount** as the edges table so promote/demote
  are atomic. The overlay is a full node (its `data.body` is the note text); render
  it as the "note" colour — the BaaS doesn't populate `GraphNode.note`, the overlay
  *is* the node.

## Phase 3 reminder

Build the inspector's "save" as a `/txn` batch (node + same-mount edges). Keep
batches small (data-plane txn TTL ~30s). Trust `guarantee:"atomic"` for same-mount;
never imply atomicity across mounts; check `rowCount`.

# Working with real BaaS data — pointer + the Mongo mount you asked for

> **Canonical, thorough guide (BaaS side):** `apps/baas/wiki/osionos-real-data-guide.md`.
> This file is the osionos-facing summary + the new credentials.

## The MongoDB mount is provisioned ✅ (this was the BaaS-only blocker)

| Engine | `dbId` | Collection | Notes |
|---|---|---|---|
| MongoDB | **`ca660785-ccc3-48b9-92fd-a47c7a863923`** | `og_people` | **non-transactional → use `/query` insert, not `/txn`** |

So you now have **Postgres + MySQL + MongoDB** mounts. To deliver the **PG + Mongo**
graph (your recommended option), make the 2-line sync change:

```ts
const MONGO = "ca660785-ccc3-48b9-92fd-a47c7a863923";
// CRM contacts → Mongo og_people via PLAIN /query insert (mongo isn't transactional)
await baasInsert(MONGO, "og_people", contact);
// edge: pg node → mongo person, into the edges mount
await baasInsert(EDGES, "og_edges",
  { id, from:`${PG}:og_nodes:${taskId}`, to:`${MONGO}:og_people:${contactId}`, type:"Client" });
```

Then add to `.env`:
`VITE_BAAS_GRAPH_RESOURCES` → include `{"dbId":"ca660785-…","table":"og_people"}`.

**Live-verified:** a PG node + a Mongo person connect across backends in
`/graph/overview` (2 backends, the cross-DB `Client` edge resolves both ends).

## Things I fixed/clarified for you (all verified)

- **Mongo logical ids now round-trip.** The adapter no longer overwrites your
  `id:"p1"` with Mongo's ObjectId, so overview-listed Mongo nodes (`og_people:p1`)
  match the edges that reference them. (Was a real disconnect bug.)
- **`upsert` 502 explained + fixed on the fixture.** Upsert needs a
  `UNIQUE(owner_id, <key>)` index (`ON CONFLICT (owner_id, id)`); I added it to
  `og_nodes`/`og_edges`/`og_overlays`, so upsert now works there. Elsewhere, prefer
  `insert` (new) + `update` (existing) — your current pattern is fine.
- **`/txn` is Postgres/MySQL only.** Mongo/Redis return `400 unsupported_capability`
  for transactions — that's why Mongo writes must be plain `/query` inserts.
- **Check `rowCount`.** A no-op update is `201` + `rowCount:0`, not an error.
- **`409 Conflict`** now carries the real reason for dup-key/constraint hits.

See the canonical guide for the full write/read/aggregate reference.

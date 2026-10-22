# ADR 0006 — `sys:` sources are read projections that never enter the known store

Status: accepted 2026-10-22 (devil verdict BLOCK on the P4-1 spec for b and c, D-P4-1s; the bridge
half proceeds).

## Decision
- **A `sys:<source>` block shows the caller's own data.** The bridge answers one route per source,
  `GET /api/account/self-data/<source>`.
  - The user id comes only from the verified session.
  - Each source has one column allowlist.
  - The cap is 200 rows, with `truncated` computed from a 201st row.
  - `my-sessions` and `my-published` are read through the account role, so RLS enforces them. The
    other four are service-role reads scoped by the path filter, each pinned by a mutant.
- **The rows never enter the known database store.** That store lives under a browser-global
  localStorage key and is pushed to `/api/object-databases` under whoever is signed in. A `sys:`
  block keeps its own in-memory state, dropped on sign-out.
- **There is one way to insert a block: the "My data" slash group.** It creates a block whose
  `databaseId` is `sys:<source>`. The `sys:` sources are not registered in the vendored registry,
  so the Source picker, whose `bindViewSource` merges rows into the running store, cannot bind
  them.
- **The only thing a user saves is the view.** It is stored in `osionos_user_settings`, under a
  section derived from the source id, with an enumerated key allowlist.

## Why
Picking a `sys:` source in the Source picker wrote the caller's sessions, page titles and peer cards
into storage the next account on the same device reads. It also made a read-only source
writable.

## Rejected
- **Keeping the picker path with a "do not merge" exception:** it would mean a second code path
  in vendored code.
- **A table per source:** the six sources already have tables.

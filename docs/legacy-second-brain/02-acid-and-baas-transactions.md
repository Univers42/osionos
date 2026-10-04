# Second Brain — ACID & BaaS Transactions (02 / 8)

> Owns **correctness of writes**. Locked decision: *ACID across backends is the
> Prismatica BaaS's responsibility* (it is the backend-agnostic layer attached to
> the whole project). osionos does **not** implement distributed transactions;
> it consumes a transactional contract and presents an optimistic, reconciled UI.

---

## 0. Reality check — verified against the BaaS code (2026-06-02)

The BaaS today has **real single-backend ACID** (Postgres, MySQL; Mongo
intra-replica-set) and **no cross-backend transactions**: a `TxSession` is
pinned to one `mount_id`, `two_phase_commit: false` on all engines, and
`TxHandle::prepare()` is a stub. Strong ACID across a set that includes
Redis/HTTP/Mongo is **not just unbuilt — it's a fundamental limit** (no rollback
/ no prepare phase on HTTP & Redis). So the literal "atomic multi-op commit
across engines" framing below is an **overclaim** and is corrected here:

- **The graph almost never needs a cross-backend transaction.** A relationship
  is one row in a dedicated **`edges` mount** (`{from, to, type}` where `from`/`to`
  are `mount:resource:pk` ids). Creating a cross-DB link is a **single-row insert
  into one backend = Tier-0 atomic**. The cross-DB-ness is in the edge's
  *content*, not in the *write* spanning engines. This is the central
  simplification (see doc 01 §4, doc 03).
- **Reads:** a node read is atomic; a cross-DB *subgraph* is assembled from N
  atomic reads → **eventually consistent, not a global snapshot.** A graph view
  tolerates this by design. We do not promise (or need) a global atomic snapshot.
- **Writes use a tiered, honestly-advertised guarantee**, never silently weaker:

  | Tier | Guarantee | Backends | Status |
  |------|-----------|----------|--------|
  | 0 | single-backend ACID | PG, MySQL, Mongo(intra-RS) | ✅ today |
  | 1 | 2PC / XA | PG ⨯ MySQL only | viable, opt-in "strict" |
  | 2 | saga / compensation (atomic-by-undo, not isolated) | any incl. Redis/HTTP/Mongo | viable |
  | 3 | outbox / CDC eventual | any | partial in infra |

So everywhere below reads "atomic across engines", read instead: *request a
guarantee, run the strongest tier the participant set supports, and return which
tier was actually delivered.* `/txn/v1` is needed only for the rarer genuine
multi-row / two-way-relation write — most graph edits are single-row edge inserts.

---

## 1. Why this matters for a graph

A graph edit is rarely one write. "Link task → project" touches the task row
*and* (for a two-way relation) the project row. "Convert record to note"
(doc 06) creates a note doc *and* stamps the source record. "Drag 12 nodes into
a new tag cluster" (doc 03) writes 12 rows. If any of these partially fail, the
graph shows edges to nodes that don't exist on one side — corruption the user
can see. **Multi-write edits must be atomic.** That atomicity has to span
engines, because the task may live in Postgres and the project in Mongo.

Single-engine atomicity is not enough, and it's not something a browser client
can guarantee. Hence: the BaaS commits; osionos requests and reconciles.

---

## 2. Current contract (the gap)

[`baas-client.ts`](../../src/shared/api/baas-client.ts) today exposes only:

```
POST /query/v1  { engine, collection, action: read|create|update|delete, filter, data }
```

One op, one engine, no atomic grouping, no version check. Good enough for a
single field edit; unsafe for any multi-write or cross-engine edit.

---

## 3. The contract osionos needs from the BaaS: `POST /txn/v1`

A single atomic unit of work, possibly spanning engines, with optimistic
concurrency. This is the **request osionos sends**; the BaaS is free to
implement it via native transactions, 2-phase commit, or a saga (§5).

```ts
// txn/baasTxnClient.ts (osionos side — the wire contract)
interface TxnOp {
  engine: 'postgresql' | 'mongodb' | string;
  collection: string;          // table / collection
  action: 'create' | 'update' | 'delete';
  recordId?: string;           // required for update/delete
  data?: Record<string, unknown>;
  /** Optimistic concurrency: commit only if the stored version matches. */
  expectedVersion?: number;
}

interface TxnRequest {
  ops: TxnOp[];                // committed all-or-nothing
  idempotencyKey: string;      // client-generated UUID; safe retries (§6)
  jwt: string;
}

interface TxnResult {
  ok: boolean;
  /** The consistency tier ACTUALLY delivered — never silently weaker (§0). */
  guarantee: 'single_backend_acid' | 'xa_2pc' | 'saga' | 'rejected';
  committed?: { recordId: string; version: number }[];   // new versions to adopt
  conflict?: { recordId: string; expected: number; actual: number }[]; // §7
  error?: { code: string; message: string };
}

export async function commitTxn(req: TxnRequest): Promise<TxnResult>;
```

Contract guarantees osionos relies on (and documents as the BaaS's job):
- **Atomicity:** either every op commits or none does.
- **Isolation:** concurrent txns don't interleave into a partial read.
- **Durability:** on `ok:true`, the write survives crash (BaaS WAL/commit).
- **Consistency:** permission-engine + schema-service validate before commit.
- **Idempotency:** same `idempotencyKey` ⇒ at most one commit (§6).

> osionos owns none of the ACID letters. It owns *asking correctly* and
> *reacting correctly*.

---

## 4. osionos-side write pipeline (optimistic, reconciled)

```
user edits node ──► build TxnRequest ──► mutationQueue.enqueue()
                                            │  (1) apply optimistically to
                                            │      canonical state (echo ≤1 frame)
                                            │  (2) graph patch → worker+renderer
                                            ▼
                                       commitTxn() ──► BaaS /txn/v1
                                            │
                  ┌─────────────────────────┼─────────────────────────┐
                  ▼ ok                        ▼ conflict                ▼ error
        adopt returned versions      reload affected records      rollback optimistic
        (replace temp versions)      re-derive, re-apply edit      patch; toast; keep
        clear queue entry            on fresh version, or          edit in a "pending"
                                     surface a merge prompt        retry buffer
```

- **Optimistic apply** is what makes the graph feel instant (the ≤1-frame echo
  budget from doc 00). We reuse the same incremental `GraphPatch` path from
  doc 01 — the UI doesn't wait for the network.
- **`mutationQueue`** serializes writes per record id (FIFO) so we never send two
  conflicting versions for the same row in flight; independent records commit in
  parallel.

```ts
// txn/mutationQueue.ts
interface PendingMutation {
  id: string;                 // == idempotencyKey
  request: TxnRequest;
  optimisticPatch: GraphPatch;  // for rollback
  affectedRecordIds: string[];
  status: 'pending' | 'inflight' | 'failed';
  retries: number;
}
```

---

## 5. How the BaaS can satisfy `/txn/v1` (informative, not osionos's code)

We document the expectation so the BaaS team can implement against it:

- **Single-engine txn (common):** all ops target Postgres → native `BEGIN … COMMIT`. All ops target one Mongo replica set → multi-document transaction. Trivially ACID.
- **Cross-engine txn (task in PG, project in Mongo):** a **saga with an
  outbox** coordinated by the data-plane-router:
  1. Stage each op in its engine in a "prepared" state (or write to an outbox).
  2. Coordinator records intent in a durable txn log (the source of truth for
     recovery).
  3. Commit phase flips all engines; on any failure, run compensating actions
     (the inverse op) recorded at stage time.
  4. Crash recovery replays the txn log: re-commit prepared, or compensate.
- **Why saga not strict 2PC:** Mongo+PG don't share an XA coordinator;
  blocking 2PC across heterogeneous engines is fragile. A saga with idempotent
  ops + compensations is the pragmatic ACID-equivalent for this stack, and it's
  already the shape the `adapter-registry`/`data-plane-router` services imply.

osionos treats all of this as a black box behind `commitTxn`.

---

## 6. Idempotency & retries

- Every `TxnRequest` carries a client UUID `idempotencyKey`.
- The BaaS dedupes on it (commit at most once); a network-timeout retry with the
  same key is safe and returns the original `TxnResult`.
- `mutationQueue` retries with exponential backoff on transport errors (5xx,
  timeout), **never** on `conflict` (that needs reconciliation, §7) or on a
  `4xx` validation error (that needs the user).

---

## 7. Optimistic concurrency & conflict handling

- Every `GraphNode` carries `version` (doc 01). Edits send `expectedVersion`.
- On `conflict`, osionos:
  1. Re-reads the affected records from the BaaS (`/query/v1 read`),
  2. re-derives those nodes (incremental patch),
  3. **re-applies the user's intended change** onto the fresh version when it's
     non-overlapping (e.g., they edited `status`, someone else edited `assignee`
     → auto-merge, re-commit),
  4. if the same field changed, surface a tiny inline merge in the inspector
     (their value vs server value) — no data lost silently.
- This is "last-writer-wins, but informed" — enough for v1. **CRDT field-merge
  is a documented future extension** if true concurrent multiuser editing of the
  same field becomes a requirement.

---

## 8. Reads, caching, and the "lots of data" path

- Initial load: the canonical `NotionState` already hydrates from seed/live
  loaders (`pgLoadPages`/`mongoLoadPages`) — unchanged.
- For large live datasets the graph **does not** require every field of every
  row. Derive needs only: id, databaseId, title, group property, relation/tag
  property values, version. We request a **projection** (column subset) so 10k
  rows stay light; `fields` for the inspector are fetched lazily per node click.
- A short-TTL read cache (keyed by `engine:collection:filter`) in
  `baasTxnClient` collapses duplicate reads during reconciliation storms.

---

## 9. Failure UX (must be visible, never silent)

- Pending mutations render their nodes/edges with a subtle "pending" treatment
  (doc 05) until acknowledged.
- A failed mutation keeps the optimistic edit in a retry buffer and shows a
  non-blocking toast with "Retry / Discard". Discard rolls back via the stored
  `optimisticPatch`.
- A conflict never just discards the user's keystrokes (see §7).

---

## 10. Definition of done for this layer

- [ ] `commitTxn` wire contract agreed with the BaaS team; `/txn/v1` stubbed.
- [ ] `mutationQueue` with per-record serialization, idempotency keys, backoff.
- [ ] Optimistic apply + rollback wired to the doc-01 patch path.
- [ ] Conflict reconciliation (auto-merge non-overlapping; inline merge on clash).
- [ ] Read projection for graph fields; lazy `fields` hydration for inspector.
- [ ] Tests: atomic group rollback, idempotent retry, conflict auto-merge,
      conflict clash prompt (all against a mock BaaS).

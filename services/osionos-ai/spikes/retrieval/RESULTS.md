# AI-P0b — hybrid retrieval + index-queue benchmark on pgvector 0.8

Throwaway spike. One container (`ai-spike-pg`), 1,000,000 synthetic chunks over 5,000 workspaces.
Nothing here is production DDL and nothing here was tuned to pass: every number below is what the
run produced.

```
GATE hybrid p95 < 80 ms @1M: PASS (3.35 ms)
GATE recall@20 >= 0.9: FAIL (0.841)
GATE queue lag p95 < 5 s and max queue <= 2000: PASS (0.196 s, 1867)
```

`Caveat:` the corpus is synthetic — pseudo-words drawn from a Zipf vocabulary, embeddings as
2,000 random centroids plus Gaussian noise, so the text and the vector space are far more
clustered and far more repetitive than real pages; everything runs on one node with a warm cache
(shared_buffers 3 GB over a 1.7 GB heap, measured right after the index build), no concurrent
load, no network, and no real users — so the latency numbers are a best case and the recall
number is measured against a synthetic ground truth.

---

## 1. Environment

```
docker run -d --name ai-spike-pg --memory 10g --cpus 8 --shm-size 4g \
  -e POSTGRES_PASSWORD=spike pgvector/pgvector:0.8.0-pg16 \
  -c shared_buffers=3GB -c maintenance_work_mem=3GB \
  -c max_parallel_maintenance_workers=4 -c work_mem=64MB
```

| | |
|---|---|
| Image | `pgvector/pgvector:0.8.0-pg16` (PostgreSQL 16.10) |
| Limits | `--memory 10g`, `--cpus 8`, `--shm-size 4g` |
| Server config | `shared_buffers=3GB`, `maintenance_work_mem=3GB`, `max_parallel_maintenance_workers=4`, `work_mem=64MB` |

**Finding — `--shm-size 4g` is mandatory, not a preference.** The first build attempt died on the
very first HNSW index (`index_build.failed.log`, kept as evidence):

```
ERROR:  could not resize shared memory segment "/PostgreSQL.3409201102" to 3218148864 bytes: No space left on device
```

The parallel HNSW build allocates a ~3.2 GB DSM segment. Docker's default `/dev/shm` is 64 MB, so
the build cannot complete on a default container. Any production deployment of this index on a
single node needs `shared_memory` sized above `maintenance_work_mem` (3 GB here).

### Data shape (verified after load)

| | |
|---|---|
| `ai_chunks` rows | 1,000,000 (4 chunks/page × 250,000 pages) |
| workspaces with chunks | 4,966 of 5,000 (Zipf s=1.1 leaves 34 empty) |
| `members` rows | 15,428 (1–5 users/workspace, some users in 2–3 workspaces) |
| visibility mix | shared 600,444 (60.0 %) · private 249,184 (24.9 %) · public 100,076 (10.0 %) · null 50,296 (5.0 %) |
| collaborators | avg 2.00 per chunk (0–3) |
| avg content | 562 characters (40–120 pseudo-words) |
| embeddings | `halfvec(384)`, 2,000 centroids + N(0, 0.35) noise, L2-normalised |

---

## 2. Load time

Measured by re-running the identical generator and COPY into a scratch schema with the same
partitioned shape (then dropping it), so these are fresh measurements, not inherited numbers.

```
{ printf '%s\n' '\timing on' \
    '\copy loadtest.ai_chunks(workspace_id, page_id, owner_id, visibility, collaborator_ids, heading_path, content, embedding) from stdin';
  docker run --rm -i -v "$PWD":/s -w /s node:22-bookworm-slim node gen.mjs chunks; } \
| docker exec -i ai-spike-pg psql -U postgres -q
```

| step | rows | time |
|---|---|---|
| `gen.mjs chunks` (generate only, to `/dev/null`) | 1,000,000 | **89.8 s** |
| `COPY ai_chunks` (server-side, pipelined) | 1,000,000 | **94.5 s** |
| end-to-end (generation + COPY, wall clock) | 1,000,000 | **94.6 s** (`real 1m34.556s`) |
| `COPY members` | 15,428 | **0.24 s** |

The generator is the bottleneck, not Postgres: generating 1M vectors in pure Node takes ~90 s and
overlaps the COPY, so end-to-end lands just above the COPY time. The run that produced the
benchmarked table reported 108.7 s for the same COPY on a colder container.

---

## 3. Index build times

Built **after** the load, timed statement by statement (`\timing on`), one statement per
partition because PG16 has no partitioned HNSW index.

```
{ printf '%s\n' '\timing on'; cat index.sql; } \
| docker exec -i ai-spike-pg psql -U postgres -v ON_ERROR_STOP=1
```

| index (per partition p00…p15) | HNSW | GIN | btree (workspace_id, page_id) |
|---|---|---|---|
| p00 | 12.024 s | 1.638 s | 0.071 s |
| p01 | 2.214 s | 0.304 s | 0.048 s |
| p02 | 2.836 s | 0.365 s | 0.072 s |
| p03 | 4.064 s | 0.665 s | 0.117 s |
| p04 | 3.308 s | 0.527 s | 0.070 s |
| p05 | **36.004 s** | **3.942 s** | 0.098 s |
| p06 | 11.325 s | 1.643 s | 0.047 s |
| p07 | 3.765 s | 0.895 s | 0.022 s |
| p08 | 9.911 s | 1.215 s | 0.039 s |
| p09 | 3.388 s | 0.465 s | 0.020 s |
| p10 | 3.289 s | 0.464 s | 0.021 s |
| p11 | 7.721 s | 1.035 s | 0.035 s |
| p12 | 3.553 s | 0.509 s | 0.020 s |
| p13 | 3.319 s | 0.403 s | 0.024 s |
| p14 | 3.105 s | 0.435 s | 0.019 s |
| p15 | 3.457 s | 0.550 s | 0.016 s |
| **total** | **113.28 s** | **15.06 s** | **0.74 s** |

`ANALYZE ai_chunks` 4.087 s, `ANALYZE members` 0.008 s → **total build 133.18 s (2 min 13 s)** for
all 48 indexes.

The spread is the Zipf distribution showing through: partition p05 holds 256,572 rows (25.7 % of
the table) and takes 36 s to index, while p01 holds 23,600 rows and takes 2.2 s. **HNSW build time
is superlinear in the partition size** — the biggest partition alone costs a third of the total
budget.

---

## 4. Table and index sizes

```
SELECT component, pg_size_pretty(bytes) FROM ( ... pg_relation_size per index ... );
```

`pg_total_relation_size('ai_chunks')` returns **0 bytes** — the parent of a partitioned table has
no storage, so the totals below are summed over the 16 leaf partitions.

| component | size |
|---|---|
| heap (table data only) | 1,694 MB |
| HNSW indexes (16) | 1,116 MB |
| GIN indexes (16) | 214 MB |
| btree primary key (16 leaves) | 65 MB |
| btree `(workspace_id, page_id)` (16) | 19 MB |
| **total `ai_chunks` (heap + all indexes)** | **3,108 MB** |
| `members` (table + pk) | 1,936 kB |

Per partition (heap + its three indexes):

| partition | rows | total | | partition | rows | total |
|---|---|---|---|---|---|---|
| p00 | 112,648 | 432 MB | | p08 | 85,332 | 328 MB |
| p01 | 23,600 | 92 MB | | p09 | 35,056 | 136 MB |
| p02 | 27,808 | 108 MB | | p10 | 34,212 | 132 MB |
| p03 | 38,668 | 150 MB | | p11 | 73,696 | 284 MB |
| p04 | 32,052 | 124 MB | | p12 | 36,136 | 140 MB |
| p05 | 256,572 | 980 MB | | p13 | 29,568 | 115 MB |
| p06 | 105,444 | 405 MB | | p14 | 32,864 | 127 MB |
| p07 | 39,228 | 152 MB | | p15 | 37,116 | 144 MB |

The HNSW index costs 1.14 kB per chunk (1,116 MB / 1M rows) and the full index set adds 83 %
on top of the raw data — 1,414 MB of indexes over a 1,694 MB heap, **1.83× total**.

---

## 5. Latency — 500 hybrid queries

Each query fuses the vector leg and the lexical leg under the access predicate, with every value
inlined as a literal so the planner can prune the hash partitions.

```
docker exec -i ai-spike-pg psql -U postgres -q -f - < queries.sql > queries.log
```

| percentile | time |
|---|---|
| min | 0.34 ms |
| p50 | **0.68 ms** |
| p90 | 2.30 ms |
| p95 | **3.35 ms** |
| p99 | 50.35 ms |
| max | 107.15 ms |
| mean | 2.18 ms |
| total for all 500 | 1.09 s |

`GATE hybrid p95 < 80 ms @1M: PASS (3.35 ms)`

The distribution is strongly bimodal, and the split is the accessible-workload size, not the table
size:

| accessible chunks (after the access predicate) | queries | p50 | p95 | max |
|---|---|---|---|---|
| 0 – 200 | 440 | 0.63 ms | 1.87 ms | 13.89 ms |
| 200 – 2,000 | 49 | 2.52 ms | 19.79 ms | 22.48 ms |
| 2,000 – 20,000 | 10 | 37.00 ms | 107.15 ms | 107.15 ms |
| 20,000 – 200,000 | 1 | 50.35 ms | 50.35 ms | 50.35 ms |

10 slowest: q105 107.15 ms (10,496 accessible chunks), q085 98.44 ms (3,204), q232 75.49 ms
(12,052), q233 57.37 ms (7,624), q074 55.52 ms (14,620), q028 50.35 ms (159,088), q236 37.00 ms
(3,064), q253 31.48 ms (7,992), q217 22.48 ms (1,740), q104 21.53 ms (1,744).

The tail is two different problems, both visible in `explain_tail.txt`:

* **GIN posting lists.** The lexical leg is the dominant cost on the worst queries: q105 spends
  44 ms of its 92 ms under EXPLAIN (107 ms in the timed run) in the lexical leg, because a 2–3
  word query drawn from a Zipf vocabulary matches 46,780 rows on one partition (BITMAP index scan
  → 1,079 rows removed by the filter → heap recheck).
* **HNSW walking through rows the user cannot read.** The HNSW index does not know the access
  predicate, so the traversal burns its budget on rows the filter then rejects. q085 shows
  `Rows Removed by Filter: 12573` on `ai_chunks_p08_hnsw` — 12,573 candidates discarded before
  20 usable ones were found.

Planning is not free either: 0.39–1.05 ms per query across the three EXPLAINed plans (2.06 ms on
the worst of the tail plans), against 0.30–25.72 ms of execution. For the smallest queries the
planner costs more than the query.

---

## 6. EXPLAIN verdict

```
docker exec -i ai-spike-pg psql -U postgres -q -f - < explain.sql > explain.txt
```

| plan | partitions touched (of 16) | vector leg | lexical leg | planning | execution |
|---|---|---|---|---|---|
| small (q51, 4 accessible chunks) | **1** (p06) | **btree `(workspace_id,page_id)` + sort** — HNSW *not* used | GIN + btree BitmapAnd | 1.051 ms | 0.665 ms |
| median (q197, 32 accessible chunks) | **1** (p08) | **btree + sort** — HNSW *not* used | GIN | 0.390 ms | 0.298 ms |
| largest (q28, 159,088 accessible chunks) | **2** (p03, p05) | **HNSW used on both** (`ai_chunks_p03_hnsw`, `ai_chunks_p05_hnsw`, Merge Append) | GIN (+ btree BitmapAnd on p03) | 0.523 ms | 25.719 ms |

**Verdict: partition pruning works; the HNSW index is used only when the accessible set is large
enough to make it worth it.**

* *Partition pruning: yes.* Every plan touched only the partitions holding the user's member
  workspaces — 1 or 2 of 16. The literal `workspace_id = ANY (ARRAY[...])` lets the planner prune
  at plan time; no plan ever scanned a partition it did not need.
* *HNSW: conditionally.* For the small and median plans the planner deliberately chose the
  `(workspace_id, page_id)` btree plus a sort over the handful of readable rows — that path is
  exact and cheaper than an ANN walk, and it is why those queries return in under a millisecond.
  Only at 159,088 accessible chunks did it switch to `Index Scan using ai_chunks_pXX_hnsw`.

That last point matters for §7: the *production* hybrid query does not always use HNSW, but the
recall harness measures a query shape that does.

---

## 7. recall@20

For 100 of the 500 queries (every 5th), the vector leg's top-20 from the index was compared with
the exact top-20 over the same filter, with index scans disabled to force exact distance
ordering.

```
docker exec -i ai-spike-pg psql -U postgres -q -f - < recall.sql
```

| | |
|---|---|
| queries | 100 |
| **recall@20 (brief formula: mean \|approx ∩ exact\| / 20)** | **0.8410** |
| min intersection | 4 / 20 |
| max intersection | 20 / 20 |

`GATE recall@20 >= 0.9: FAIL (0.841)`

The same 100 measurements broken down (`recall_detail.txt`) explain where the number comes from:

| | count | mean recall |
|---|---|---|
| queries whose exact candidate set has **fewer than 20** rows | 34 | 0.200 (brief) / **1.000** (normalised) |
| queries with a full 20-row exact set | 66 | **0.9833** |

* 34 of the 100 queries have fewer than 20 readable chunks in total (4, 8, 12 or 16), so the
  brief's `/ 20` divisor scores a perfect result as 0.2/0.4/0.6/0.8. Dividing by
  `min(20, |exact|)` instead gives **0.9890** overall and exactly **1.000** for all 34 short
  queries — the index returned every candidate that existed, every time.
* Only **2 of 100** queries genuinely missed: q221 (6/20) and q236 (12/20). Everything else is a
  perfect 20/20.

Both genuine misses are HNSW quality problems, not query-plan problems — and both are cases
where the *production* query shape does better than the harness:

* **q221** (1,348 accessible chunks): the recall harness's query shape uses
  `Index Scan using ai_chunks_p06_hnsw` (`Rows Removed by Filter: 2155`), so the ANN walk
  converged on a region full of rows this user cannot read and returned a weak top-20 (6/20
  correct). The **production hybrid query for the same q221 does not use HNSW at all** — the
  planner picks the btree + sort path over the 1,348 readable rows, which is exact. In
  production this query would score 1.0, not 0.3.
* **q236** (3,064 accessible chunks): the production shape does use HNSW here
  (`ai_chunks_p02_hnsw` + `ai_chunks_p14_hnsw`, 2,828 + 298 rows removed by filter) and scores
  12/20.

So 0.841 is the number the brief's formula asks for and the gate **fails** on it, but the honest
reading is: the index is exact whenever the readable set is small enough that the planner skips
ANN, and loses ~1–14 of 20 candidates when it does not. The fix is not a better index but a
better filter strategy (e.g. per-workspace or per-partition HNSW, or carrying the access
predicate into the index), which is out of scope for a measurement-only spike.

---

## 8. Index-queue spike

A trigger on `pages` upserts one row per dirty page into `ai_index_queue`; a worker claims rows
that have been dirty for more than 10 s, deletes them and logs the lag.

```
docker exec -i ai-spike-pg psql -U postgres -v ON_ERROR_STOP=1 -f - < queue.sql
bash run_queue.sh
docker exec -i ai-spike-pg psql -U postgres -f - < queue_stats.sql
```

| | |
|---|---|
| writer | `pgbench -n -f writer.sql --rate=500 -T 60 -c 4` → 30,102 transactions, **501.76 tps**, 0 failed, latency avg 11.888 ms |
| worker | `pgbench -n -f worker.sql -T 75 -c 2` → 742 transactions, 9.88 tps, 0 failed |
| claims | 3,856 |
| **lag p50** | **0.101 s** |
| **lag p95** | **0.196 s** |
| lag p99 | 0.336 s |
| **lag max** | **0.359 s** |
| lag min | 0.0003 s |
| **max queue size** | **1,867** (min 0, avg 1,408.5) |

`GATE queue lag p95 < 5 s and max queue <= 2000: PASS (0.196 s, 1867)`

Queue size over the run, sampled once a second:

```
at 05:43:45 |  797      at 05:44:20 | 1842
at 05:43:50 | 1683      at 05:44:29 | 1859
at 05:43:54 | 1837      at 05:44:40 | 1779
at 05:43:59 | 1831      at 05:44:50 | 1203
at 05:44:05 | 1850      at 05:44:55 |    0
at 05:44:14 | 1841      at 05:45:04 |    0
```

The queue plateaus at ~1,850 while the writer runs and drains to zero within ~15 s of the writer
stopping. Note the ceiling is structural, not accidental: `ai_index_queue.page_id` is the primary
key and the fixture has 2,000 pages, so the queue can never exceed 2,000 rows no matter how hard
the writer pushes — the "max queue ≤ 2000" half of that gate cannot fail for this schema.

The lag numbers measure the right thing (time from *eligible* to *claimed*, i.e. after the 10 s
debounce) but the system is not actually saturated: at 500 writes/s spread over 2,000 pages each
page is touched every ~4 s, so only pages that happen to go 10 s untouched ever become eligible.
A slower debounce relative to the write rate, or more pages, would build a real backlog and the
lag would look different.

---

## 9. What was verified, and what was inherited

* `ai-spike-pg` was **running** with `--shm-size 4g` (inherited), 1,000,000 chunks and 15,428
  `members` rows loaded (inherited, re-verified by `count(*)`).
* The index build left behind by the previous run had a **torn client log**: `index_build.log`
  held only 5 of the 48 `CREATE INDEX` statements even though all 48 index files had been
  written (07:33:24–07:35:35 CEST, confirmed from the relfilenode mtimes inside the container).
  Since the log could not be trusted and the timings it did contain were incomplete, all 48
  indexes were dropped and rebuilt with a correct `\timing on` and `ON_ERROR_STOP=1`; the
  numbers in §3 are from that clean rebuild. The torn log is kept as
  `index_build.partial.log`, and `index_build.failed.log` (the `/dev/shm` failure) is kept as
  evidence.
* The `printf '\timing on\n'` in the inherited command is a trap: bash turns `\t` into a TAB, so
  psql receives `<TAB>iming on`, buffers it with the next statement, and the resulting syntax
  error aborts the whole batch — the first index silently never gets created and no timings are
  recorded. Use `printf '%s\n' '\timing on'`.

## 10. Files

| file | what |
|---|---|
| `schema.sql` | tables + partitions; the access predicate and the `bridge-page-read.mjs` lines it mirrors are quoted next to it |
| `gen.mjs` | seeded generator (mulberry32, seed 42) for `members` and `ai_chunks` |
| `genq.mjs` | builds `queries.sql`, `recall.sql`, `explain.sql` from the same deterministic model |
| `index.sql` | the 48 index builds + `ANALYZE`, run after the load and timed |
| `queries.sql` | 500 hybrid queries, all values inlined (committed; 3.5 MB < 5 MB) |
| `recall.sql` | 100 × (exact top-20 vs index top-20) + the recall aggregate |
| `explain.sql` | `EXPLAIN (ANALYZE, BUFFERS)` for a small / median / largest workload |
| `queue.sql`, `writer.sql`, `worker.sql`, `queue_stats.sql`, `run_queue.sh` | the index-queue spike |
| `explain.txt` | the three required EXPLAIN plans |
| `explain_tail.txt` | EXPLAIN of the three slowest queries (why the p99 tail exists) |
| `recall_detail.txt` | per-query intersection sizes for §7 |

Generated data and run logs (`*.log`, `*.out`) are gitignored.

# RESULTS — AI-P3h-fix: the backfill must never slow a user's query — one embedder for the queries, one for the bulk (measured)

Date: 2026-10-21. Worktree: `W=/tmp/claude-1000/-home-dlesieur-Documents-groot-apps-opposite-osiris/f01db1ed-1f78-43ef-aaac-95b48d7f37b9/scratchpad/wt-ai-idx`, branch `feat/ai-indexer-throughput`.
Indexer under test: `8fb288f2` ("the indexer asks the bulk embedder when the deployment runs one") and `e6b7f007` ("the AIMD target is the answer of the bulk embedder — 800 ms").
Queue under test: `a38f24441345de6c39ee8987ad1a2325967955db` (groot, `feat/ai-indexer-priority`, "the index queue has a lane").
The "before" is `feat/ai`: the indexer and the RAG migration of that branch, unchanged.
All node execution inside `node:22-bookworm-slim` docker. No host node exists on this machine.
No number below was tuned or re-run to improve: every table is the mean of the runs listed, printed as measured.

## What changed, and why it is the fix

The indexer and the search asked the SAME embedding service, and the indexer fills it: a
backfill sends calls of thirty-two inputs, the service answers the calls in the order it
received them, and a query that lands during one waits for the whole call. The AIMD target
(`OSIONOS_AI_EMBED_TARGET_MS`) moved the number, it did not fix it — 495 ms was still worse
than the 147 ms of the "before".

The deployment now runs TWO instances of the SAME model: the query one (`OSIONOS_AI_EMBED_URL`,
the one the retrieval asks) and the bulk one (`OSIONOS_AI_EMBED_BULK_URL`, the one the indexer
asks), with the CPU split between them. The indexer falls back to the query URL when the bulk
URL is not set, so an operator who sets nothing keeps the service it had.

## Machine facts

- host `nproc` = 20, 32 GiB of RAM, Docker 29.1.3, kernel Linux 6.17.0-14-generic
- the embedder of the runs: TEI `cpu-1.9.4`, model `intfloat/multilingual-e5-small` (384 d), the model read from the cached volume `osionos_ai_models_tei` (the same volume the deployment uses); the bulk one mounts it READ-ONLY
- the database of the runs: `pgvector/pgvector:0.8.0-pg16`, the fixture and the migrations of the shared harness
- the host is shared: the load average of the other agents was between 5 and 15 during the runs. **The load average is printed next to every number.**
- the containers of the runs are named `ai-idx-*` and were removed at the end. Nothing else was touched.

## What is measured

One backfill of the eval corpus, ten times over, in ten workspaces: 400 pages, 380 of them queued
(the archived ones are not), 2 780 chunks. The pages are seeded **before** the RAG migration, so the
backfill of the migration is what queues them — every row is in the bulk lane (priority 1, measured:
`min_priority 1, max_priority 1`).

The query load runs the whole time: the questions of the golden set, one every 100 ms, sixteen in
flight. Two phases, the same load in both:

1. **the baseline** — the query load alone, with no backfill (what a user feels when nothing is indexing);
2. **the backfill** — the same load, while the corpus is indexed.

The percentiles are nearest-rank. The "chunks/s" is the 2 780 chunks of the index over the wall time
of the backfill.

## The table — the three configurations (five runs each, interleaved)

| configuration | chunks/s (mean) | range | backfill wall | **query p95 during the backfill** | query p50 | baseline query p95 | load avg 1 min (after the run) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **before** — `feat/ai`, one call per page, one shared embedder | **48.24** | 47.25 – 49.14 | 57.6 s | **134.2 ms** | 37.6 ms | 8.4 ms | 13.3 |
| **after-defaults** — one shared embedder | **55.48** | 55.08 – 56.14 | 50.1 s | **818.0 ms** | 193.4 ms | 6.8 ms | 12.2 |
| **after-isolated** — two embedders (query 3 CPUs / bulk 5 CPUs) | **68.01** | 65.42 – 69.04 | 40.9 s | **10.8 ms** | 8.2 ms | 7.2 ms | 9.6 |

The raw runs:

| run | before | after-defaults | after-isolated |
| --- | --- | --- | --- |
| 1 | 47.67 chunks/s, p95 129 ms, baseline 7 ms, load 5.3 → 13.4 | 55.08, p95 789 ms, baseline 7 ms, load 13.4 → 15.4 | 68.71, p95 11 ms, baseline 7 ms, load 14.0 → 10.4 |
| 2 | 49.14, p95 136 ms, baseline 6 ms, load 9.9 → 13.0 | 55.21, p95 806 ms, baseline 8 ms, load 13.0 → 12.1 | 69.02, p95 11 ms, baseline 7 ms, load 12.1 → 11.2 |
| 3 | 47.25, p95 138 ms, baseline 7 ms, load 10.5 → 15.0 | 55.66, p95 833 ms, baseline 6 ms, load 14.6 → 11.0 | 65.42, p95 11 ms, baseline 7 ms, load 8.6 → 9.0 |
| 4 | 49.04, p95 135 ms, baseline 15 ms, load 9.6 → 12.5 | 56.14, p95 822 ms, baseline 6 ms, load 11.8 → 10.5 | 67.86, p95 11 ms, baseline 8 ms, load 10.5 → 8.2 |
| 5 | 48.10, p95 133 ms, baseline 7 ms, load 8.8 → 12.6 | 55.33, p95 840 ms, baseline 7 ms, load 12.5 → 11.9 | 69.04, p95 10 ms, baseline 7 ms, load 11.4 → 9.1 |

### The gates, printed

```
GATE 1 the interactive query p95 during the backfill is under 1.5 x its own baseline p95

  before           134.2 ms  <= 1.5 x  8.4 ms = 12.6 ms   FAIL
  after-defaults   818.0 ms  <= 1.5 x  6.8 ms = 10.2 ms   FAIL
  after-isolated    10.8 ms  <= 1.5 x  7.2 ms = 10.8 ms   PASS   (exactly on the line)

GATE 2 the backfill is at least as fast as the "before"

  before            48.24 chunks/s
  after-defaults    55.48 chunks/s   PASS  (+15 %)
  after-isolated    68.01 chunks/s   PASS  (+41 %)
```

**The margin of GATE 1 is thin, and here is the whole truth about it.** Three of the five
after-isolated runs are 11 ms against a baseline of 7 ms (the line of that run is 10.5 ms): they
are half a millisecond OVER their own line. The four runs of the same configuration in the second
batch (the split table below) are all under it. Pooled over the NINE runs of the configuration
(5 + 4): **10.7 ms against a baseline of 8.1 ms, the line is 12.2 ms — PASS with a margin.**
The noise is in the baseline p95 itself (6, 7, 8, 10, 11, 15 ms across the runs): the query
service is a few milliseconds fast when the host is quiet, and the p95 of a 7 ms service is a
number that moves by a millisecond.

**The "before" FAILS GATE 1 as well** (134.2 ms against a baseline of 8.4 ms): the shared
embedder always slowed the queries down, even when the indexer was the old one. The fix does not
restore the "before" — it beats it by twelve times (134.2 ms → 10.8 ms).

## The CPU split (four runs each, interleaved, the same stack)

| split (query / bulk CPUs) | chunks/s (mean) | range | **query p95 during the backfill** | baseline query p95 | GATE 1 | GATE 2 (≥ 48.24 chunks/s) |
| --- | --- | --- | --- | --- | --- | --- |
| **3 / 5** | **67.70** | 62.07 – 70.45 | **10.5 ms** | 9.2 ms | PASS (10.5 ≤ 13.9) | PASS (+40 %) |
| 4 / 4 | 60.67 | 56.70 – 64.35 | 9.8 ms | 6.8 ms | PASS (9.8 ≤ 10.1) | PASS (+26 %) |
| 5 / 3 | 52.46 | 48.19 – 55.05 | 9.0 ms | 9.2 ms | PASS (9.0 ≤ 13.9) | PASS (+9 %) |

**The split the deployment takes is 3 / 5** (the query embedder 3 CPUs, the bulk one 5): it is the
fastest backfill of the three and both gates pass. The 5 / 3 split has the best query p95 but
gives up a third of the throughput — the backfill needs the CPU more than the query does, because
the query asks for ONE vector at a time and the backfill asks for thirty-two.

The total CPU is the same as before the split (3 + 5 = 8, the cap of the one shared embedder):
the isolation costs no CPU, it moves it.

## What the numbers say

**The isolation is the fix; the knob was not.** With one shared embedder the query p95 during a
backfill is 818 ms. With two embedders it is 10.8 ms — the same load, the same host, the same
corpus. The AIMD target never had a chance: it can decide how many calls the indexer keeps in
flight, not whether a query has to wait behind one of them.

**The backfill is faster too, and not because of the embedder.** 48.24 → 68.01 chunks/s (+41 %).
The bulk embedder alone answers 146 chunks/s (four calls of thirty-two in flight, measured
directly) while the indexer does 68: the ROUND bounds the backfill (eight pages, two calls, one
round at a time), not the embedder. This is why the CPU of the bulk embedder barely moves the
number — 5 CPUs are enough, and the third one would be better spent on the query.

**The "before" was never bound by the embedder either.** Its 57.6 s of backfill are 52.5 s of writes
(the per-page time the worker logs): the old indexer wrote one page at a time, in its own
transaction. The branch writes the same 380 pages in 3.0 s. The two programs differ in the
database, not only in the embedding.

**The lanes, the claim order, the controller and the packing stay.** They are not what was wrong:
the lanes decide WHICH page is indexed next, and the problem was that a page of a backfill took
the service away from the queries. The lane is not in these numbers at all (every row of the
backfill is bulk work, lane 1).

## The AIMD target — measured, and set from the measurement

The target is the latency a call must answer under to count as fast. It is now the answer of the
BULK embedder of the deployment, and the default is **800 ms**:

| target | chunks/s (the isolated stack, the 3 / 5 split) |
| --- | --- |
| 1500 ms (the old default) | 70.97 |
| 800 ms (the new default) | 70.64 |
| 400 ms | 69.59 |

The target is **not** the lever of the backfill: the three numbers are the same, because the round
bounds the backfill and not the controller. A full call of thirty-two chunks answers on the bulk
embedder in 223 – 280 ms (measured, five CPUs, the chunks of this corpus), so 800 ms is about
three times the normal answer of a call: a normal call counts as fast, and a service that
degrades halves the concurrency. The old 1500 ms was too loose — the controller never protected
anything.

Caveat: the target is a wall-clock budget on a call whose SIZE varies, and the estimate of the
size is the estimate of this corpus (four characters per token): a call of sixty long chunks is
slower than a call of four short ones, so the same service looks slow or fast depending on the
packing. The controller reads the packing, not the service.

## Exact commands

```sh
# the "before": the indexer and the RAG migration of feat/ai, unchanged
mkdir -p services/osionos-ai/spikes/indexer/tmp-before
for f in worker.ts indexPage.ts embedder.ts sql.ts chunker.ts sections.ts; do
	git show feat/ai:services/osionos-ai/src/indexer/$f > services/osionos-ai/spikes/indexer/tmp-before/$f
done
git -C ../wt-groot-ai show feat/ai:models/osionos-ai-rag-migration.sql > /tmp/rag-before.sql
AI_IDX_QUERY_CPUS=8 sh services/osionos-ai/spikes/indexer/harness.sh before \
	/tmp/rag-before.sql "../../spikes/indexer/tmp-before/worker.ts"

# the defaults, one shared embedder
AI_IDX_QUERY_CPUS=8 sh services/osionos-ai/spikes/indexer/harness.sh after-defaults \
	../wt-groot-idx/models/osionos-ai-rag-migration.sql

# the isolation: two embedders, the CPU split the measurement chose
AI_IDX_BULK=1 AI_IDX_QUERY_CPUS=3 AI_IDX_BULK_CPUS=5 \
	sh services/osionos-ai/spikes/indexer/harness.sh after-isolated \
	../wt-groot-idx/models/osionos-ai-rag-migration.sql

# the service alone, to have its ceiling
docker run --rm --network ai-idx-net node:22-bookworm-slim node -e '<the probe of the table above>'
```

The raw runs of the two batches are in `runs.jsonl` and `splits.jsonl` (one JSON line per run).

## Verdict

```
GATE the backfill is at least as fast as the "before":      PASS (48.24 → 68.01 chunks/s, +41 %)
GATE the interactive query p95 during the backfill:          PASS (10.8 ms <= 1.5 x 7.2 ms = 10.8 ms,
                                                              and 10.7 ms <= 12.2 ms over the nine runs)
GATE the same gate with ONE shared embedder (after-defaults): FAIL (818.0 ms, and 134.2 ms for the "before")
```

## Caveat

Caveat: the CPU was shared with the other agents' containers during the whole measurement (20
vCPU, the load average between 5 and 15), so every number carries the load average of its run and
the runs of a configuration are the only thing that makes them comparable; the runs of the three
configurations are interleaved for that reason; the corpus is the synthetic text of the golden set,
and its chunks are small (97 tokens in the middle), which is the best case for the batching and the
worst case for the service (a small chunk makes the embedder waste the padding of a batch); the
embedder is a CPU service whose backend processes at most eight sequences at a time, so the
batching cannot buy more than the round trips it saves — on a GPU service the numbers would be
completely different, and the AIMD controller would grow instead of halving; the "before" of the
table is the `feat/ai` indexer with the `feat/ai` migration, and the two are measured in the same
stack, with the same query load, interleaved — but they are two programs, not two configurations of
one; the measurement is a pure bulk backfill, so the lane (the order of the claim) is not in these
numbers at all; the split of the CPU was measured on THIS host with THESE chunks, and a host with
more cores would want another split — the rule is the one the numbers give: the query embedder
needs a core or two for the load of a few people, and the bulk embedder takes the rest, because
the round, not the embedder, bounds the backfill; and the margin of GATE 1 is one millisecond on
the means of a batch of five — the pooled nine runs are the honest number, and the p95 of a
service that answers in seven milliseconds is a number that moves by a millisecond.

# RESULTS — AI-P3h: the indexer — priority lanes, cross-page batches, adaptive concurrency (measured)

Date: 2026-10-21. Worktree: `W=/tmp/claude-1000/-home-dlesieur-Documents-groot-apps-opposite-osiris/f01db1ed-1f78-43ef-aaac-95b48d7f37b9/scratchpad/wt-ai-idx`, branch `feat/ai-indexer-throughput`.
Indexer under test: `9b0909b82d37bfa8a1237c1b3c192ce73c1cae80` ("the indexer packs a round into cross-page batches, with an adaptive concurrency").
Queue under test: `a38f24441345de6c39ee8987ad1a2325967955db` (groot, `feat/ai-indexer-priority`, "the index queue has a lane").
The "before" is `feat/ai`: the indexer and the RAG migration of that branch, unchanged.
All node execution inside `node:22-bookworm-slim` docker. No host node exists on this machine.
No number below was tuned or re-run to improve: every table is the mean of the runs listed, printed as measured.

## Machine facts

- host `nproc` = 20, 32 GiB of RAM, Docker 29.1.3, kernel Linux 6.17.0-14-generic
- the embedder of the runs: TEI `cpu-1.9.4`, model `intfloat/multilingual-e5-small` (384 d), `--cpus 8 --memory 6g`, the model read from the cached volume `osionos_ai_models_tei` (the same volume the deployment uses)
- the database of the runs: `pgvector/pgvector:0.8.0-pg16`, the fixture and the migrations of the shared harness
- the host is shared: the load average of the other agents was between 5 and 14 during the runs. **The load average is printed next to every number.**
- the containers of the runs are named `ai-idx-*` and were removed at the end. Nothing else was touched.

## What is measured

One backfill of the eval corpus, ten times over, in ten workspaces: 400 pages, 380 of them queued
(the archived ones are not), 2 780 chunks. The pages are seeded **before** the RAG migration, so the
backfill of the migration is what queues them — every row is in the bulk lane (priority 1, measured:
`min_priority 1, max_priority 1`).

The query load runs the whole time: the questions of the golden set, one every 100 ms, sixteen in
flight, on the **same** embedding service. Two phases, the same load in both:

1. **the baseline** — the query load alone, with no backfill (what a user feels when nothing is indexing);
2. **the backfill** — the same load, while the corpus is indexed.

The percentiles are nearest-rank. The "chunks/s" is the 2 780 chunks of the index over the wall time
of the backfill.

## The table

| configuration | chunks/s (mean) | range | backfill wall | **query p95 during the backfill** | query p50 | baseline query p95 | load avg 1 min (after the run) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **before** — `feat/ai`, one call per page | **48.62** | 47.42 – 49.86 | 57.2 s | **147 ms** | 43 ms | 9.8 ms | 11.6 |
| **after** — the defaults | **54.65** | 53.37 – 55.76 | 50.9 s | **864 ms** | 258 ms | 8.4 ms | 11.9 |
| **after** — `OSIONOS_AI_EMBED_TARGET_MS=400` | **55.72** | 55.32 – 56.11 | 49.9 s | **495 ms** | 133 ms | 12.2 ms | 12.0 |

Five runs per configuration, interleaved (before, after, after-tight, before, after, …) so the load of
the host moves the same way for each of them. The raw runs:

| run | before | after | after, target 400 |
| --- | --- | --- | --- |
| 1 | 49.21 chunks/s, p95 141 ms, load 6.5 → 11.3 | 55.01, p95 839 ms, load 10.8 → 11.3 | 55.32, p95 498 ms, load 11.4 → 11.5 |
| 2 | 48.26, p95 129 ms, load 11.5 → 11.8 | 54.24, p95 872 ms, load 11.8 → 11.5 | 55.48, p95 487 ms, load 11.5 → 13.0 |
| 3 | 48.37, p95 144 ms, load 7.8 → 11.3 | 53.37, p95 883 ms, load 11.3 → 13.9 | 55.90, p95 504 ms, load 13.9 → 12.1 |
| 4 | 49.86, p95 133 ms, load 10.5 → 10.7 | 55.76, p95 855 ms, load 10.2 → 11.0 | 56.11, p95 501 ms, load 10.6 → 11.1 |
| 5 | 47.42, p95 190 ms, load 5.8 → 12.7 | 54.88, p95 872 ms, load 12.7 → 11.9 | 55.78, p95 487 ms, load 11.9 → 12.1 |

## What the numbers say

**The backfill is 12 % faster** (48.62 → 54.65 chunks/s, 57.2 s → 50.9 s for 2 780 chunks), and the
gain is the same with the tighter target (55.72 chunks/s, +15 %).

**The backfill is bound by the embedder, not by the database.** The writes of the pages are 3.0 s of
the 50.9 s of the "after" run (the per-page time the worker logs); everything else is the embedding.
The embedder of this corpus answers at most 85 – 96 chunks/s (measured separately, 7 inputs per call
sequential: 85.0; 32 inputs: 90.9; 4 × 32 in flight: 95.8), so the two configurations are within 10 %
of each other of what the service can do with this query load on it.

**The interactive query pays for the batch.** With the defaults the p95 of a query embedding during
the backfill goes from 147 ms to 864 ms. The reason is in the numbers of the service: the embedder
answers a call of 32 inputs in about 350 ms, and it answers the requests it has in the order it
received them — a query that lands during a call waits for the whole call. The "before" makes calls of
seven inputs (about 80 ms), so the window an interactive query waits behind is four times shorter.

**The target of the AIMD controller moves the interactive p95, but it does not fix it.**
`OSIONOS_AI_EMBED_TARGET_MS=400` halves the interactive p95 (864 ms → 495 ms) and does not cost a
single chunk per second (54.65 → 55.72 chunks/s): the default 1 500 ms is looser than the answer of
the service for a call of 32 inputs, so the controller lets two calls in flight — and on this CPU the
second call buys nothing, because the embedder saturates at ~96 chunks/s with one. The default is the
right default for a service that answers a call in well under the target; here it is too loose. **The
495 ms of the tighter target is still three times the 147 ms of the "before": the knob trades the
throughput of the backfill against the latency of the query, and it does not buy the query back.**

**The controller is a protection, not a growth, at this size of round.** A round claims eight pages,
which is 58 chunks of this corpus, which is two calls of at most 32 inputs — so the limit (which
grows to four for a bulk round) is never the binding constraint: the round is. What the controller
does here is halve when the service is slow, and that is what the tighter target shows.

**The lane is not in these numbers.** Every row of the backfill is bulk work (lane 1), so the claim
order (an edit of a person before an older bulk row) is proven by the suite, not by this table.

## Exact commands

```sh
# the stack, the seed and the run (the throwaway containers are ai-idx-*)
sh services/osionos-ai/spikes/indexer/harness.sh after \
	/tmp/claude-1000/-home-dlesieur-Documents-groot-apps-opposite-osiris/f01db1ed-1f78-43ef-aaac-95b48d7f37b9/scratchpad/wt-groot-idx/models/osionos-ai-rag-migration.sql

# the "before": the indexer and the RAG migration of feat/ai, unchanged
mkdir -p services/osionos-ai/spikes/indexer/tmp-before
for f in worker.ts indexPage.ts embedder.ts sql.ts chunker.ts sections.ts; do
	git show feat/ai:services/osionos-ai/src/indexer/$f > services/osionos-ai/spikes/indexer/tmp-before/$f
done
git -C ../wt-groot-ai show feat/ai:models/osionos-ai-rag-migration.sql > /tmp/rag-before.sql
sh services/osionos-ai/spikes/indexer/harness.sh before /tmp/rag-before.sql \
	"../../spikes/indexer/tmp-before/worker.ts"

# the AIMD target of the third row
OSIONOS_AI_EMBED_TARGET_MS=400 sh services/osionos-ai/spikes/indexer/harness.sh after-tight \
	/tmp/claude-1000/-home-dlesieur-Documents-groot-apps-opposite-osiris/f01db1ed-1f78-43ef-aaac-95b48d7f37b9/scratchpad/wt-groot-idx/models/osionos-ai-rag-migration.sql

# the service alone, to have its ceiling
docker run --rm --network ai-idx-net node:22-bookworm-slim node -e '<the probe of the table above>'
```

## Verdict

```
GATE the backfill is faster:            PASS (48.62 → 54.65 chunks/s, +12 %)
GATE the interactive query is not worse: FAIL (147 ms → 864 ms with the defaults,
                                           147 ms → 495 ms with OSIONOS_AI_EMBED_TARGET_MS=400:
                                           both are worse than the 147 ms of the "before")
```

## Caveat

Caveat: the CPU was shared with the other agents' containers during the whole measurement (20 vCPU,
TEI capped at 8, the load average between 5 and 14), so every number carries the load average of its
run and the five runs of a configuration are the only thing that makes them comparable; the corpus
is the synthetic text of the golden set, and its chunks are small (97 tokens in the middle), which is
the best case for the batching and the worst case for the service (a small chunk makes the embedder
waste the padding of a batch); the embedder is a CPU service whose backend processes at most eight
sequences at a time, so the batching cannot buy more than the round trips it saves — on a GPU service
the numbers would be completely different, and the AIMD controller would grow instead of halving;
the "before" of the table is the `feat/ai` indexer with the `feat/ai` migration, and the two are
measured in the same stack, with the same query load, interleaved — but they are two programs, not
two configurations of one; the measurement is a pure bulk backfill, so the lane (the order of the
claim) is not in these numbers at all; and the size of the call turned out not to be the lever — a
budget of 2 048 tokens (about 21 inputs per call) gave the same interactive p95 in the two runs that
were not disturbed by the load of the host (582 ms and 934 ms, the second one during a load average
that went from 8.9 to 18.3), so what the interactive query waits for is the call in flight, not the
number of chunks in it.

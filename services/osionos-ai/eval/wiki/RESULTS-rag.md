# RAG at 110363 chunks: hybrid, rerank, abstention (M2)

Measured, not claimed: every number below comes from the command in "Reproduce". The 200 questions are drafted
by a 4B model and checked by nobody (see the Caveats); read the numbers as "on this set".

## Decision

Reranker kept, OFF by default on this hardware: recall@5 paired CI low -0.013 (needs > 0) / abstention F1 on the test half 0.714 (needs >= 0.6); at least one holds, but its p95 of 22106 ms is over the service's 1500 ms timeout, so in the product every call would time out and fall back to the hybrid. The abstention needs the rerank score, so it is off with it.

This decision line was corrected by hand after the run (2026-10-23 04:18): the script's rule then looked at quality only. measure-rag.ts now adds the latency half, and the next run writes this line itself. What would turn it on: a reranker whose p95 on 20 candidates fits 1500 ms (a GPU, a smaller cross-encoder, or fewer candidates), measured with this script.

## Reproduce

```sh
docker run --rm --network ai-m2-net --memory 2g --cpus 2 --env-file /home/dlesieur/wt-ai-night/tmp/m2.env -e OSIONOS_AI_EMBED_URL=http://ai-m2-tei-embed:80 -e OSIONOS_AI_RERANK_URL=http://ai-m2-tei-rerank:80 -e OSIONOS_AI_RERANK_TIMEOUT_MS=60000 -e MEASURE_META=/meta/m2-meta.json -e MEASURE_OUT=/app/services/osionos-ai/eval/wiki/RESULTS-rag.md -v /home/dlesieur/wt-ai-night/wt-ai-m2:/app -v /home/dlesieur/wt-ai-night/tmp:/meta:ro -w /app/services/osionos-ai node:22-bookworm-slim node --experimental-strip-types eval/wiki/measure-rag.ts
```

- commit: `ed549e367c36c3533b0a937b8d6dde33cd57ba77`
- corpus: 110363 chunks, 17001 pages (Simple English Wikipedia, 200 questions: 160 answerable, 40 not)
- rerank fallbacks during the run: 0 (any fallback would make variant 2 partly variant 1)
- pins:
  - reranker BAAI/bge-reranker-v2-m3@953dc6f6f85a1b2dbfca4c34a2796e7dde08d41e
  - embedder intfloat/multilingual-e5-small
  - TEI image ghcr.io/huggingface/text-embeddings-inference@sha256:2538ea1c9640d3763b15af668039d24172d063b42337b0c27796fc2be180c78d

## Load

- during this run: not captured by the script at the time (it only had the lines below). Two `uptime` samples the lead
  took while it ran (question 114/200 at 03:29): `03:26:20 load average: 11.70, 9.68, 9.59` and
  `03:29:56 load average: 9.49, 10.01, 9.77`. The script now records os.loadavg at its start and end.
- when the stack was built (02:37–02:42, about an hour before the run):
  - ` 02:37:47 up  9:57,  1 user,  load average: 9.46, 9.30, 9.63`
  - `               total        used        free      shared  buff/cache   available`
  - `Mem:              31          20           2           0           8          10`
  - `Swap:             24          17           7`
  - ` 02:42:47 up 10:02,  1 user,  load average: 4.92, 7.30, 8.75`
  - `               total        used        free      shared  buff/cache   available`
  - `Mem:              31          18           4           0           7          13`
  - `Swap:             24          17           7`

## Variant 1: hybrid (reranker off), 160 answerable questions

Mean [95% bootstrap CI, 1000 resamples, seed 42]; binary relevance on distinct pages.

| Metric | Value |
|---|---|
| recall@5 | 0.806 [0.738, 0.869] |
| MRR@10 | 0.714 [0.645, 0.774] |
| nDCG@10 | 0.743 [0.677, 0.799] |

Retrieval latency, all 200 questions: p50 39 ms, p95 63 ms (n=200)

## Variant 2: hybrid + rerank (top 20 to the cross-encoder), 160 answerable questions

| Metric | Value |
|---|---|
| recall@5 | 0.825 [0.762, 0.881] |
| MRR@10 | 0.781 [0.715, 0.841] |
| nDCG@10 | 0.796 [0.732, 0.853] |

Retrieval latency including the rerank, all 200 questions: p50 13650 ms, p95 22119 ms (n=200)
Rerank call by itself: p50 13639 ms, p95 22106 ms (n=200)

### Variant 2 minus variant 1, paired (same questions, same resamples)

| Metric | Difference |
|---|---|
| recall@5 | 0.019 [-0.013, 0.050] |
| MRR@10 | 0.067 [0.026, 0.111] |
| nDCG@10 | 0.054 [0.021, 0.088] |

## Variant 3: abstention on the rerank score

Positive = unanswerable. Rule: abstain when the best rerank score of the 20 candidates is under the threshold.
The halves are drawn with seed 42: each holds 80 answerable and 20 unanswerable questions.

- median top rerank score: 0.970 on answerable, 0.088 on unanswerable
- threshold chosen on the calibration half: 0.2952 (calibration F1 0.696)

| Test half (n=100) | Value [95% CI] |
|---|---|
| precision | 0.682 [0.474, 0.857] |
| recall | 0.750 [0.545, 0.944] |
| F1 | 0.714 [0.529, 0.857] |
| answerable wrongly abstained | 0.087 [0.027, 0.151] |

The hybrid alone cannot be scored this way: its RRF top score does not separate the two groups (eval/RESULTS.md).

## Caveats

- The questions are LLM-drafted (Qwen3-4B-Instruct-2507) and 0 are human-validated; a wrong or ambiguous question lowers every metric.
- "Unanswerable" is approximate: another imported article may still mention the subject.
- Latency is CPU on a shared host, at the load above; a different host moves it. The default rerank timeout (1500 ms) is not what this run used: it ran with OSIONOS_AI_RERANK_TIMEOUT_MS=60000.
- The threshold holds for this model and this corpus only; another reranker or corpus needs its own measurement.
- Relevance is one page per question, so recall@5 is "is the source page in the first 5 distinct pages".
- The bootstrap resamples questions; it does not capture drafting variance across another LLM run.

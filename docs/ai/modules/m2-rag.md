# M2 — RAG on a large dataset: hybrid search, rerank, abstention

Answers from the user's workspace with citation chips, permission-aware, hybrid
lexical + vector search in Postgres (RRF over a tsvector and an HNSW index), an
optional cross-encoder rerank, and a calibrated "not found". Measured on 110363
chunks / 17001 pages of Simple English Wikipedia. The small workspace golden set
(n=68) gives recall@5 0.78 and MRR@5 0.719 (`services/osionos-ai/eval/RESULTS.md`).

## What an evaluator does in three minutes

1. **The answer, with citations (ai-dev stack, https://localhost:13001).** Open the
   Assistant on the demo workspace, ask a question, read the answer with its `[n]`
   markers and citation chips; click a chip — the page opens and scrolls to the
   block (`src/features/chat/model/openCitation.ts:25`,
   `src/widgets/chat-shell/ui/ChatThread.tsx:61`).
2. **The numbers.** Read `services/osionos-ai/eval/wiki/RESULTS-rag.md`: variant 1
   (hybrid), variant 2 (hybrid + rerank), variant 3 (abstention), and the
   decision line.
3. **Rebuild the corpus (≈ 55 min of embedding; not a 3-minute step).** The
   110k corpus was measured on a throwaway stack that is torn down; rebuilding
   it takes about 55 min at 33.4 chunks/s (README "Choosing N"). Command block
   from `services/osionos-ai/eval/wiki/README.md` "Run it" (step 3):

   ```sh
   # ≈ 55 min of embedding for N = 17000 (33.4 chunks/s, including the 10 s debounce).
   docker run --rm -v "$PWD:/app:ro" -v osionos_ai_wiki_data:/data:ro -w /app "$NODE_IMAGE" \
     node services/osionos-ai/eval/wiki/import.mjs --workspace-owner <owner uuid> --limit 17000 \
     | docker exec -i <eval db container> psql -v ON_ERROR_STOP=1 -U <user> -d <database>
   ```

## The commands (the gates)

```sh
# The service suite (throwaway Postgres + Redis, AI + RAG migrations).
sh services/osionos-ai/scripts/test.sh /path/to/osionos-ai-migration.sql \
                                       /path/to/osionos-ai-rag-migration.sql

# The layout of the service.
docker run --rm -v "$PWD":/app -w /app/services/osionos-ai node:22-bookworm-slim \
  node_modules/.bin/tsc --noEmit -p tsconfig.json

# The client.
bash scripts/docker-run.sh test-canvas

# The eval unit tests (17 tests).
node --test services/osionos-ai/eval/wiki/rag-stats.test.mjs \
            services/osionos-ai/eval/wiki/golden.test.mjs

# The measurement (110363 chunks). Run from the repository root.
# <env file holding OSIONOS_AI_* settings> is the env file of the eval stack
# (database, embedding and rerank settings); <meta directory> holds m2-meta.json.
docker run --rm --network ai-m2-net --memory 2g --cpus 2 --env-file <env file holding OSIONOS_AI_* settings> -e OSIONOS_AI_EMBED_URL=http://ai-m2-tei-embed:80 -e OSIONOS_AI_RERANK_URL=http://ai-m2-tei-rerank:80 -e OSIONOS_AI_RERANK_TIMEOUT_MS=60000 -e MEASURE_META=/meta/m2-meta.json -e MEASURE_OUT=/app/services/osionos-ai/eval/wiki/RESULTS-rag.md -v "$PWD":/app -v <meta directory>:/meta:ro -w /app/services/osionos-ai node:22-bookworm-slim node --experimental-strip-types eval/wiki/measure-rag.ts
```

## What proves what

| Claim | Proof |
|---|---|
| Permission-aware retrieval | `services/osionos-ai/tests/retrieval.test.ts:62` (a private page of one user is invisible to the other; a membership that ends ends at once); `services/osionos-ai/tests/aclAgreement.test.ts:161` (the SQL pre-filter and the bridge rule agree on every row); code `services/osionos-ai/src/retrieval/search.ts:223` (`readablePages` re-checks with the bridge's rule) and `:363` (workspaces read live) |
| Large dataset (110363 chunks, 17001 pages) | `services/osionos-ai/eval/wiki/RESULTS-rag.md:19`; `services/osionos-ai/eval/wiki/README.md` "Choosing N" (N = 17000 articles → 110362 chunks) |
| Retrieval quality (hybrid) | `services/osionos-ai/eval/wiki/RESULTS-rag.md:47-49` (variant 1 table: recall@5 0.806 [0.738, 0.869], MRR@10 0.714 [0.645, 0.774], nDCG@10 0.743 [0.677, 0.799]) |
| Rerank gain (paired) | `services/osionos-ai/eval/wiki/RESULTS-rag.md:68-70` (MRR@10 +0.067 [0.026, 0.111], nDCG@10 +0.054 [0.021, 0.088] exclude 0; recall@5 +0.019 [-0.013, 0.050] does not) |
| Abstention | `services/osionos-ai/eval/wiki/RESULTS-rag.md:84` (F1 0.714 [0.529, 0.857] on the test half); code `services/osionos-ai/src/retrieval/search.ts:332` (`shouldAbstain`) and `:339` (`abstainThreshold`) |
| Latency | `services/osionos-ai/eval/wiki/RESULTS-rag.md:51` (hybrid p95 63 ms) and `:62` (rerank p95 22106 ms) |
| Citations in the client | `src/features/chat/model/openCitation.ts:25` (opens the page and scrolls to the block); `src/widgets/chat-shell/ui/ChatThread.tsx:61` (renders cited answer) |
| Rerank timeout and fallback | `services/osionos-ai/src/retrieval/rerank.ts:16` (`RERANK_TIMEOUT_MS = 1500`); `services/osionos-ai/src/retrieval/search.ts:319` (rerank fallback logged, fused order stands) |

## The measure

Corpus: 110363 chunks, 17001 pages (Simple English Wikipedia, 200 questions: 160 answerable,
40 not). Rerank fallbacks during the run: 0. Pins: reranker
BAAI/bge-reranker-v2-m3@953dc6f6f85a1b2dbfca4c34a2796e7dde08d41e; embedder
intfloat/multilingual-e5-small; TEI image
ghcr.io/huggingface/text-embeddings-inference@sha256:2538ea1c9640d3763b15af668039d24172d063b42337b0c27796fc2be180c78d.

### Variant 1: hybrid (reranker off), 160 answerable questions

Mean [95% bootstrap CI, 1000 resamples, seed 42]; binary relevance on distinct pages.

| Metric | Value |
|---|---|
| recall@5 | 0.806 [0.738, 0.869] |
| MRR@10 | 0.714 [0.645, 0.774] |
| nDCG@10 | 0.743 [0.677, 0.799] |

Retrieval latency, all 200 questions: p50 39 ms, p95 63 ms (n=200)

### Variant 2: hybrid + rerank (top 20 to the cross-encoder), 160 answerable questions

| Metric | Value |
|---|---|
| recall@5 | 0.825 [0.762, 0.881] |
| MRR@10 | 0.781 [0.715, 0.841] |
| nDCG@10 | 0.796 [0.732, 0.853] |

Retrieval latency including the rerank, all 200 questions: p50 13650 ms, p95 22119 ms (n=200)
Rerank call by itself: p50 13639 ms, p95 22106 ms (n=200)

#### Variant 2 minus variant 1, paired (same questions, same resamples)

| Metric | Difference |
|---|---|
| recall@5 | 0.019 [-0.013, 0.050] |
| MRR@10 | 0.067 [0.026, 0.111] |
| nDCG@10 | 0.054 [0.021, 0.088] |

### Variant 3: abstention on the rerank score

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

The hybrid alone cannot be scored this way: its RRF top score does not separate the two groups
(`services/osionos-ai/eval/RESULTS.md`).

## The decision

> Reranker kept, OFF by default on this hardware: recall@5 paired CI low -0.013 (needs > 0) /
> abstention F1 on the test half 0.714 (needs >= 0.6); at least one holds, but its p95 of 22106 ms
> is over the service's 1500 ms timeout, so in the product every call would time out and fall back to
> the hybrid. The abstention needs the rerank score, so it is off with it.

In plain words: the reranker improves the ranking (MRR@10 +0.067, nDCG@10 +0.054, CIs exclude 0) and
makes abstention possible (F1 0.714), but on this CPU its p95 is about 15× the service's 1500 ms
timeout (`RERANK_TIMEOUT_MS`, `services/osionos-ai/src/retrieval/rerank.ts:16`), so every product call
would time out and fall back to the hybrid order. Abstention is off with it, because it needs the
rerank score. What turns it on: a GPU, a smaller cross-encoder, or fewer candidates, measured with
the same script.

## Caveats

- Caveat: the questions are LLM-drafted (Qwen3-4B-Instruct-2507) and 0 are human-validated; a wrong
  or ambiguous question lowers every metric.
- "Unanswerable" is approximate: another imported article may still mention the subject.
- One relevant page per question, so recall@5 is "is the source page in the first 5 distinct pages".
- CPU latency on a shared host at load ≈ 9.49–11.70 (see the `uptime` samples in RESULTS-rag.md).
- The threshold (0.2952) holds for this model and this corpus only; another reranker or corpus needs
  its own measurement.

## What this module does NOT do (yet)

- The answer-quality eval (faithfulness and relevance by a calibrated LLM judge) is not measured.
- The 110k corpus is not on the eval or public stack; it lives on a throwaway stack.
- The reranker is off by default; abstention is off with it.
- Cross-lingual recall is the earlier 0.43 (`services/osionos-ai/eval/RESULTS.md`, line 27) and is
  not re-measured on the wiki set.

## Reading

- `services/osionos-ai/eval/wiki/RESULTS-rag.md` (the 110363-chunk run)
- `services/osionos-ai/eval/RESULTS.md` (small workspace golden set, n=68)
- `services/osionos-ai/eval/wiki/README.md` (corpus, import rate, golden set)
- `services/osionos-ai/src/retrieval/search.ts` (`retrieve`, `shouldAbstain`, `abstainThreshold`)
- `services/osionos-ai/src/retrieval/rerank.ts` (`RERANK_TIMEOUT_MS`, fallback)
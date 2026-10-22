# A1 — the encoders on TEI (CPU): toxicity, sentiment, rerank

Run 2026-10-22, 11:19–15:31 local, `sh encoders.sh rerank; sh encoders.sh toxicity; sh encoders.sh sentiment`
(each model in its own TEI `cpu-1.9.4` container, no network, `--memory 7g --cpus 6`). Pins: `../../models.lock`.
Raw scores: `<model>/scores.tsv`; every number below is a line of `<model>/run.log`.

**Caveat: the host was NOT quiet** — load average 8 → 38 during the runs (five agents and their test suites
beside it). Latencies are upper bounds of what a quiet CPU does; quality numbers are unaffected.

## Servable on TEI cpu-1.9.4

| Candidate | Result |
| --- | --- |
| `textdetox/xlmr-large-toxicity-classifier-v2` (tox-xlmr-large) | served |
| `lxyuan/distilbert-base-multilingual-cased-sentiments-student` (sent-distilbert) | served |
| `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1` (rerank-mmarco) | served |
| tox-xlm-roberta, sent-nlptown | no `tokenizer.json` (TEI needs fast tokenizers) |
| tox-bert-multilingual | `config.json` has no `id2label` |
| sent-modernbert | no suitable backend |
| `BAAI/bge-reranker-v2-m3`, rerank-gte-base | candle did not start; ORT wants `onnx/model.onnx`, not in the pinned files |

## Toxicity (M4 L1) — tox-xlmr-large

| Set | Lang | Rows | Toxic | Best-F1 t | P | R | F1 | Lowest t with P ≥ 0.95 (Wilson low) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HateCheck | en | 3728 | 2563 | 0.50 | 0.776 | 0.865 | 0.818 | **none** |
| HateCheck | fr | 3718 | 2600 | 0.51 | 0.798 | 0.739 | 0.767 | **none** |
| HateCheck | es | 3745 | 2632 | 0.50 | 0.785 | 0.880 | 0.830 | **none** |
| textdetox | en | 5000 | 2500 | 0.81 | 0.995 | 0.996 | 0.996 | 0.50 (0.989) |
| textdetox | fr | 5000 | 2500 | 0.72 | 0.994 | 0.998 | 0.996 | 0.50 (0.989) |
| textdetox | es | 5000 | 2500 | 0.50 | 0.982 | 0.987 | 0.985 | 0.50 (0.976) |

Latency: one 32-token text p50 85.6 ms / p95 102.8 ms; a batch of 32 p50 2399 ms (82 ms per text). RSS 3.38 GiB.

**Reading.** textdetox is the model's own task family (in-distribution, likely overlapping its training data):
its 0.99 is not evidence. HateCheck is the out-of-distribution functional test, and there **no threshold reaches a
precision of 0.95 in any language**. So C83's floor for auto-removal (≥ 0.95 per language on ≥ 100 items) is NOT
met: L1 ships **log-only + hold-for-review** (a human decides), never auto-remove. Re-measure on real labelled
osionos reports before any change.

## Sentiment (M6) — sent-distilbert vs the course baseline (TF-IDF + LR)

| Lang | Rows | Model macro-F1 | Baseline macro-F1 |
| --- | --- | --- | --- |
| en | 870 | 0.465 | **0.503** |
| fr | 870 | 0.443 | **0.542** |
| es | 870 | 0.446 | **0.502** |

The model almost never predicts **neutral** (en: 9 of 290 neutral rows; fr: 5; es: 18) — confusion matrices in
`sent-distilbert/run.log`. Latency p50 9.6 ms single, 10.6 ms per text in a batch of 32; RSS 678 MiB.

**Reading.** The only servable off-the-shelf candidate LOSES to the course's TF-IDF + LR baseline in all three
languages. M6 cannot ship it as "the model". Next: an XLM-R sentiment model (the plan's original pick, e.g.
`cardiffnlp/twitter-xlm-roberta-base-sentiment`), fetched off this host (Hugging Face answers 429 here), measured on
the same 2610 rows, kept only if it beats the baseline.

## Rerank (M2) — rerank-mmarco

| Case | p50 | p95 |
| --- | --- | --- |
| one (query, passage) pair, 301-token passage | 69.5 ms | 92.0 ms |
| 20 pairs in one call | 1806.6 ms | 3288.7 ms |
| 4 such calls at once (wall) | — | 8901.5 ms |

RSS 2.15 GiB. **Reading:** a CPU cross-encoder over the top 20 is 20–40× the ≤ 80 ms retrieval budget. M2 cannot
rerank every question on this CPU. What stays open: top-8 with passages cut to ~128 tokens (estimated
~8 × 30 ms ≈ 240 ms, NOT measured), an opt-in "precise" answer mode, or the reranker on the GPU (llama.cpp
`--reranking`) — each must be measured before it is chosen.

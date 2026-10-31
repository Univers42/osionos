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
| `cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual` (sent-xlmr-cardiff) | served from `pytorch_model.bin` as is |
| `tabularisai/multilingual-sentiment-analysis` (sent-tabularis) | served |
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

## Sentiment (M6) — three candidates vs the course baseline (TF-IDF + LR)

Test set: the 2610-row en/fr/es set (870 per language, `tyqiangz/multilingual-sentiments` test, classes
negative/neutral/positive). Baseline: TF-IDF (1-2 grams) + logistic regression trained on the train split of each
language. CI = paired bootstrap 95% of (model macro-F1 − baseline macro-F1), 1000 resamples of rows, seed 42
(`encoders-bench.py: bootstrap_diff`). Labels read from each model's `config.json` id2label; the map is in
`sentiment_map` (tabularisai: very negative + negative → negative, neutral → neutral, positive + very positive →
positive). Run 2026-10-22 22:41–22:45 UTC, `sh encoders.sh sentiment2`.

| Model | Lang | Macro-F1 | Accuracy | Baseline macro-F1 (acc) | Diff, CI 95% |
| --- | --- | --- | --- | --- | --- |
| **sent-xlmr-cardiff** | en | **0.712** | 0.714 | 0.503 (0.505) | **+0.209 [+0.170, +0.252]** |
| **sent-xlmr-cardiff** | fr | **0.723** | 0.723 | 0.542 (0.543) | **+0.181 [+0.136, +0.224]** |
| **sent-xlmr-cardiff** | es | **0.697** | 0.697 | 0.502 (0.503) | **+0.195 [+0.158, +0.238]** |
| sent-tabularis | en | 0.571 | 0.574 | 0.503 | +0.068 [+0.023, +0.112] |
| sent-tabularis | fr | 0.352 | 0.415 | 0.542 | −0.190 [−0.234, −0.144] |
| sent-tabularis | es | 0.531 | 0.540 | 0.502 | +0.030 [−0.014, +0.072] |
| sent-distilbert (earlier run) | en / fr / es | 0.465 / 0.443 / 0.446 | not recorded | 0.503 / 0.542 / 0.502 | below baseline; CI not computed |

Confusion matrices (rows truth, columns prediction; in `<model>/run.log`): cardiff predicts neutral properly
(en 171/290, fr 187/290, es 174/290 neutral rows right). tabularis in French predicts neutral for 710 of 870 rows
(negative recall 58/290, positive 41/290): that is the 0.352.

The run.log files were not committed. The matrices of the shipped model and of the baseline, rebuilt on
2026-10-30 by `encoders/sentiment-matrices.py` (its header has the command): the model's from
`sent-xlmr-cardiff/scores.tsv`, the baseline re-trained with the bench's own `baseline()`. Both macro-F1 equal
the table above in every language (the script asserts it). Order: negative / neutral / positive.

| Lang | cardiff, truth negative | truth neutral | truth positive | baseline, truth negative | truth neutral | truth positive |
| --- | --- | --- | --- | --- | --- | --- |
| en | 234 / 46 / 10 | 66 / 171 / 53 | 19 / 55 / 216 | 176 / 75 / 39 | 109 / 121 / 60 | 68 / 80 / 142 |
| fr | 228 / 21 / 41 | 29 / 187 / 74 | 31 / 45 / 214 | 176 / 64 / 50 | 49 / 158 / 83 | 63 / 89 / 138 |
| es | 216 / 61 / 13 | 61 / 174 / 55 | 15 / 59 / 216 | 164 / 79 / 47 | 87 / 116 / 87 | 61 / 71 / 158 |

Each cell is the predicted negative / neutral / positive count of the 290 rows of that truth. Negative read as
positive or the reverse: baseline vs model en 107 vs 29, es 108 vs 28, but fr 113 vs 72 — French is where the
model swaps the two poles most (41 negative rows read positive).

| Model | Latency p50 single (31 tok) | p50 batch of 32 | per text in batch | RSS (docker stats, after the run) |
| --- | --- | --- | --- | --- |
| sent-xlmr-cardiff (278M params, 12 layers) | 17.5 ms (p95 41.6) | 612.7 ms | 19.4 ms | 2.32 GiB |
| sent-tabularis (distilbert, 6 layers) | 8.9 ms (p95 28.0) | 303.9 ms | 9.6 ms | 679 MiB |

**Caveat: load.** Host 1-min load average was 3.09 before the runs and 11.95 (end of cardiff) – 17.31 (end of
tabularis) at the end of the runs (their own containers included): latencies are upper bounds. Quality numbers are
unaffected.

**Serving.** `cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual` ships only `pytorch_model.bin`; TEI
cpu-1.9.4 loaded it as is (ready in 7 s), so no conversion was needed and no safetensors revision exists
(`/api/models/<repo>/refs` lists only `main`, `converts: []`). The pinned `.bin` is trusted through its sha256 in
`models.lock` (a pickle file: it was only ever loaded inside a no-network container). TEI logs "Starting Bert
model" and a gelu-tanh approximation warning for it; the scores nevertheless match the model card's range (card:
macro-F1 0.693 on its own tweet set; here 0.70–0.72 on reviews/other text), so no sign of a broken load, but a
logit-by-logit comparison against `transformers` was NOT done.

**Licences (hub metadata / model card).**

| Model | Licence |
| --- | --- |
| cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual | none declared (no `license` in the card or the hub metadata; the base `cardiffnlp/twitter-xlm-roberta-base` and the training dataset `cardiffnlp/tweet_sentiment_multilingual` declare none either). Needs a legal check before shipping. |
| tabularisai/multilingual-sentiment-analysis | **cc-by-nc-4.0 (non-commercial)** |
| lxyuan/distilbert-base-multilingual-cased-sentiments-student | apache-2.0 |

**Pick.** `sent-xlmr-cardiff` is the only candidate above the baseline in all three languages, with every CI
above 0 (+0.18 to +0.21 macro-F1). It is 2.3x slower than tabularis per text (19 ms vs 10 ms in a batch under load;
single 17.5 ms) and uses 2.32 GiB RSS. Open facts for the product decision: (1) its licence is undeclared;
(2) its training data is tweets, the test set is reviews/other text (the gain holds there, but real osionos page
text was not measured); (3) tabularis is out regardless: non-commercial licence, and it loses to the baseline in
French. The baseline stays the comparison to report against.

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

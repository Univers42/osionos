# Summary recall — context C392

The quality gate of the conversation summary before any public flag: 20 synthetic threads state three
facts in their first turn, talk long enough that the history window drops it, then ask for the facts.

- Date: 2026-10-26T19:04:21Z
- Commit: a16d1511e01a1f7e12bd81ed5205598f01116e2e
- Command: `sh services/osionos-ai/eval/summary-recall.sh`
- Model: Qwen3-4B-Instruct-2507-Q4_K_M.gguf (sha256 3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597), llama.cpp vulkan, temperature 0
- Wall time: 1647 s; summary call p50 11715 ms over 220 calls

## Result

| | Recall of the early facts |
| --- | --- |
| Without the summary (flag off) | 0.000 |
| With the summary | 1.000 |
| **Improvement** | **1.000** (gate ≥ 0.3: **PASS**) |

| Fact | Without | With |
| --- | --- | --- |
| codename | 0.000 | 1.000 |
| budget | 0.000 | 1.000 |
| contact | 0.000 | 1.000 |

## What the rolling summary keeps

Each run whose window dropped new turns rewrites the summary from the previous one and those turns. The share of
the three facts still in the summary after each rewrite:

| Rewrite | Threads | Facts kept |
| --- | --- | --- |
| 1 | 20 | 1.000 |
| 2 | 20 | 1.000 |
| 3 | 20 | 1.000 |
| 4 | 20 | 1.000 |
| 5 | 20 | 1.000 |
| 6 | 20 | 1.000 |
| 7 | 20 | 1.000 |
| 8 | 20 | 1.000 |
| 9 | 20 | 1.000 |
| 10 | 20 | 1.000 |
| 11 | 20 | 1.000 |

Mean summary length: 2384 characters.

## Caveat

The user turn carries no account, view or workspace block, no tools and no retrieval, so a real prompt is longer.
Recall is a substring match of a normalised key (the codename, the digits of the budget, the surname): a model that
spells a surname differently is counted as forgetting it, so the numbers under-report rather than over-report. The
model is the local Qwen3-4B Q4_K_M, smaller than the platform's models.

# Answer evaluation results

Overall: faithfulness=0.890, relevance=4.025, abstention_precision=0.571, abstention_recall=0.100

By origin:
- human: n=68, faithfulness=0.868, relevance=3.985, abstention_precision=1.000, abstention_recall=0.200
- llm-drafted: n=132, faithfulness=0.902, relevance=4.045, abstention_precision=0.400, abstention_recall=0.067

Command: node --experimental-strip-types eval/answers/answers.ts
## Run

- 2026-10-23, 17:43 → 19:01 local (78 min, on a loaded host), osionos `39f3d15bc`, groot migrations at `b9f0f447`:
  `sh services/osionos-ai/eval/answers/answers.sh <groot>/models/osionos-ai-migration.sql <groot>/models/osionos-ai-rag-migration.sql`
- Answer model and judge: `unsloth/Qwen3-4B-Instruct-2507-GGUF` Q4_K_M (snapshot `a06e946bb6b655725eafa393f4a9745d460374c9`), llama.cpp `server-b11580`, CPU. Embedder: `intfloat/multilingual-e5-small` on TEI `cpu-1.9.4`.
- The 30 rows of `labels.jsonl` hold this run's answers, sources and judge verdicts; the `human` fields are empty until a person labels them (`LABELLING.md`).

Caveat: the judge is the same 4B model that wrote the answers, so it can favour its own wording, and it is not
calibrated yet: these scores are the judge's, not a measured faithfulness, until `calibrate.ts` compares them with the
30 human labels. Abstention here is only "retrieval returned nothing": the run has no reranker and no
`OSIONOS_AI_ABSTAIN_THRESHOLD`, so the low abstention recall (0.10) measures that fallback, not the service's
rerank-score abstention.

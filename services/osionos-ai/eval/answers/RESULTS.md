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
`OSIONOS_AI_ABSTAIN_THRESHOLD`, which is the product's default on CPU (the reranker is off there, see
`../wiki/RESULTS-rag.md`). So the low abstention recall (0.10) is the default product's; the rerank-score abstention
is measured in that file's variant 3, not here.

## Calibration of the judge (2026-10-25)

`node --experimental-strip-types eval/answers/calibrate.ts` on the 30 rows of `labels.jsonl`: **kappa −0.087 on
faithfulness, Spearman 0.785 on relevance; calibrate.ts exits 1 (kappa < 0.6)**.

- Faithfulness: the judge agrees on 25 of 30, but on none of the hard cases. The three answers labelled unfaithful
  (q28: the hotel's first payment is inferred from the standard schedule; q46: "two hundred thousand" where the page
  says two hundred and sixty thousand; q155: a specification rule presented as the leadership decision) were all
  judged faithful, and two correct abstentions (q41, q171) were judged unfaithful. So the faithfulness figure above
  (0.890) is not a measurement: with this judge it carries no information beyond the base rate.
- Relevance: the judge ranks the answers the way the labels do (ρ 0.785); the relevance figure is usable.
- Two questions (q46 and q48: `acl` questions with expected pages, asked by a reader who has access) were scored
  as unanswerable in this run; `answers.ts` now counts them as answerable, so the abstention numbers above are off by
  those two until the next run.

Caveat: the 30 labels were written by Claude (claude-opus-5-5) at the user's request, not by a person; every row says
so in `labeller`. This measures the 4B judge against a stronger model's reading of the same sources, which is a
weaker reference than the human labels the plan asks for. A person can overwrite any `human` field; the next run
clears a label whose answer changed.

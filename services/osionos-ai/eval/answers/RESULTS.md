# Answer evaluation results

Overall: faithfulness=0.707, relevance=3.288, abstention_precision=0.652, abstention_recall=0.789

By origin:
- human: n=68, faithfulness=0.712, relevance=3.409, abstention_precision=0.429, abstention_recall=0.750
- llm-drafted: n=132, faithfulness=0.705, relevance=3.227, abstention_precision=0.750, abstention_recall=0.800

Command: node --experimental-strip-types eval/answers/answers.ts
Judge: claims

## Run

- 2026-10-25, 17:21 → 18:44 local, groot migrations at `12dcb1e0`, `ANSWER_JUDGE=claims` with a checkpoint
  (`ANSWERS_CHECKPOINT`): questions 1–144 on the CPU (17:21 → 18:38), then the run was stopped and resumed from the
  checkpoint with `LLM_BACKEND=vulkan` for the last 56 (18:39 → 18:44).
  `sh services/osionos-ai/eval/answers/answers.sh <groot>/models/osionos-ai-migration.sql <groot>/models/osionos-ai-rag-migration.sql`
- Answer model and judge: `unsloth/Qwen3-4B-Instruct-2507-GGUF` Q4_K_M (snapshot `a06e946bb6b655725eafa393f4a9745d460374c9`),
  llama.cpp `server-b11580` (CPU) and `server-vulkan-b11580` (RX 6600). Embedder: `intfloat/multilingual-e5-small` on TEI `cpu-1.9.4`.
- The scores above are the claims judge's with every option off, the over-strict judge measured below; they are not
  a measured faithfulness. The labels say 164 of the 168 held-out answers are faithful (0.976).
- `labels.jsonl` keeps the answers its 30 labels were written for (the 2026-10-23 run); this run changed 4 of them
  (q155, q168, q59, q87), and the file was restored so the calibration set does not move.

Caveat: the answers come from two backends, which can differ slightly at temperature 0 (`harness.sh`,
`harness_start_llm`). A label is about one stored answer, so the judge comparisons below are unaffected; the scores
above mix the two.

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

## Claim-level judge (2026-10-25)

A second judge (`eval/answers/claimJudge.ts`) checks every claim of the answer against a quote it must copy from
a source, then asks whether the quote states the claim. `eval/answers/rejudge.sh` re-judges the stored answers and
calibrates the result:

```sh
sh eval/answers/rejudge.sh osionos_ai_models_llm 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf' whole  /tmp/rejudge-whole-4b.jsonl
sh eval/answers/rejudge.sh osionos_ai_models_llm 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf' claims /tmp/rejudge-claims-4b.jsonl
```

- whole (the control): **kappa −0.087, Spearman 0.785** — the recorded one-shot calibration, so the rejudge path
  matches `answers.ts`.
- claims: **kappa 0.412, Spearman 0.727** — better than the one-shot judge, still below the 0.6 bar (`calibrate.ts`
  exits 1).
- Where the claims judge disagrees with the labels: it marks all three unfaithful answers (q28, q46, q155) unfaithful,
  and six faithful ones unfaithful too. Two of those six are "not specified in the provided sources" answers (q41,
  q171) that the judge did not count as abstentions. The other four (q13, q35, q104, q117) are paraphrases whose
  claims failed the verbatim quote check or the entailment question, which is the over-strict direction its
  `Caveat:` names.

- Afterwards, having seen the 4B numbers, the same two judges were run with a larger model,
  `Qwen2.5-14B-Instruct` Q4_K_M (`LLM_MEMORY=12g sh eval/answers/rejudge.sh <volume> 'Qwen2.5-14B-Instruct-Q4_K_M.gguf'
  <judge> <out>`). Because the model was chosen after the first results, this is a post-hoc comparison:

  | judge | model | kappa (faithful) | Spearman (relevant) | unfaithful caught | faithful flagged |
  |---|---|---|---|---|---|
  | whole | Qwen3-4B | −0.087 | 0.785 | 0 / 3 | 2 / 27 |
  | claims | Qwen3-4B | 0.412 | 0.727 | 3 / 3 | 6 / 27 |
  | whole | Qwen2.5-14B | 0.000 | 0.721 | 0 / 3 | 0 / 27 |
  | claims | Qwen2.5-14B | 0.322 | 0.173 | 3 / 3 | 8 / 27 |

  What catches the unfaithful answers is splitting the answer into claims, not the size of the model: the one-shot
  judge misses all three at either size. What keeps every variant below 0.6 is over-strictness, faithful paraphrases
  that fail the verbatim quote check. No variant passes `calibrate.ts`. The next lever is the one the
  `quoteFound` caveat names, a looser quote match. Testing it needs a labelled set the prompts were never run on.

Caveat: only 3 of the 30 labels are unfaithful, so one verdict moves kappa a lot, and a kappa near 0.6 on this set
does not prove much. Both prompts were written once from the brief and each variant ran once, with no tuning on
these rows.

## Judge options and the held-out set (2026-10-25)

All on the GPU (`LLM_BACKEND=vulkan`), claims judge, Qwen3-4B-Instruct-2507 Q4_K_M. A rejudge of the 30
calibration rows takes 90 s here against about 8 minutes on the CPU, with the same kappa on a repeat run.

```sh
CLAIM_ABSTAIN_RULE=<0|1> CLAIM_SOURCE_FALLBACK=<0|1> LLM_BACKEND=vulkan \
  sh eval/answers/rejudge.sh osionos_ai_models_llm 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf' claims <out.jsonl>
LABELS_FILE=heldout.jsonl CLAIM_SOURCE_FALLBACK=1 LLM_BACKEND=vulkan \
  sh eval/answers/rejudge.sh osionos_ai_models_llm 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf' claims <out.jsonl>
```

Calibration rows (`labels.jsonl`, 30 rows, 3 unfaithful):

| abstainRule | sourceFallback | kappa | Spearman |
|---|---|---|---|
| off | off | 0.468 | 0.765 |
| on | off | 0.615 | 0.765 |
| off | quote not found only (first version) | 0.468 | 0.765 |
| off | on | 1.000 | 0.765 |
| on | on | 1.000 | 0.765 |

`sourceFallback` asks whether the whole cited source supports a claim whose quote check failed, because a claim
often joins two sentences of one source and quotes one of them (q13, q104, q117).

The settings were then frozen by a rule written before any held-out verdict was read: the highest calibration kappa,
and on a tie the fewer options, so `sourceFallback` on and `abstainRule` off. `heldout.jsonl` holds 168 rows: the 30
held-out questions plus every other question of this run except q199 and q200, whose stored answers were lost. They
were labelled blind (question, answer and sources, no verdict); 4 are unfaithful (q65, q75, q127, q167).

**Held-out, run once: kappa 0.168, Spearman 0.741; `calibrate.ts` exits 1.** The judge flags 14 of the 164 faithful
answers and misses 2 of the 4 unfaithful ones (q75 says the oak is maple, q167 says "twelve per cent or above"
where the source says above twelve). So the calibration result was fitted to its 30 rows, and no judge here reaches
0.6 yet. In the traces (`<out>.jsonl.trace.jsonl`), the 14 false flags fall into two groups:

- The yes/no check rejects a claim the quote does state: the product name is only implied by the source
  (q86 "the Brindle chair legs splay four degrees" against "The legs splay four degrees"), the claim and the source
  are in different languages (q61, q83, q124), or a number is in digits on one side and words on the other (q154).
- The claim list: an abstention sentence is listed as a claim and fails (q81, q82, q179), or one claim is listed
  twice with two sources and fails on the weaker one (q11, q61, q124).

Caveat: the labels are Claude's (claude-opus-5-5), not a person's, and four of the unfaithful calls are close
(q65, q127, q167, and q34 the other way). With 4 unfaithful rows in 168, kappa moves a lot with one verdict, and
even a judge that catches all 4 needs about 4 false flags or fewer to reach 0.6. The held-out set has now been
read for errors, so the next judge needs a fresh set to be confirmed on.

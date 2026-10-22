# The golden set — a synthetic workspace and 68 questions with known answers

The RAG phase (plan P3) is accepted on a golden set: recall@5 of hybrid retrieval over a
demo workspace. There was no text corpus yet, so this directory writes one: 40 pages of
prose about a fictional company, 68 questions about it, a seed generator and a gate that
proves the corpus and the questions agree with each other.

Everything here is DATA, and the runner that measures the retrieval on it. The corpus is the golden
set; the runner is the report card of the retrieval (`src/retrieval/search.ts`), of the indexer
(`src/indexer/*`) and of the real embedder.

## What is in here

| Path | What it is |
| --- | --- |
| `corpus/*.md` | 40 pages with front matter (`title`, `visibility`, `owner`, `collaborators`, `archived`) |
| `golden.jsonl` | 68 questions, one JSON object per line |
| `seed.mjs` | reads the corpus, writes idempotent SQL for `osionos_pages` on stdout |
| `check.mjs` | the gate: the corpus and the questions must agree, or it exits non-zero |
| `check-corpus.mjs`, `check-questions.mjs`, `check-lib.mjs` | the two halves of the gate and their shared ground |
| `lib.mjs` | the parsing the seed and the gate share |
| `text.mjs` | the text helpers the question rules are written against |
| `fixture.sql` | the fixture of the throwaway stack (the roles, the two tables, the two functions) |
| `harness.sh` | the shared parts of the throwaway stacks: the network, the fixture, the migrations |
| `run.sh` | the runner: a throwaway Postgres, a throwaway TEI, a throwaway LLM, and node:22 that measures |
| `run.ts` | the measurement: recall@5, MRR, leaks, the negative scores, the latency |
| `stack.ts` | the throwaway stack of a run: the seed, the members, the indexer |
| `score.ts` | the numbers of a run: the recall, the MRR, the groups |
| `report.ts` | the markdown of `RESULTS.md` |
| `fusion.ts` | the lists of a search (several at once, one per language) and their RRF fusion |
| `variants.ts` | the four variants of the multilingual experiment |
| `llm.ts` | the query translation of the local llama.cpp server |
| `multilingual-report.ts` | the markdown of `RESULTS-multilingual.md` |
| `RESULTS.md` | the last measurement of the baseline, written by `run.ts` |
| `RESULTS-multilingual.md` | the last measurement of the four variants |

## The corpus

Northwind Atelier is a fictional contract furniture maker with sixty people, a workshop in
Vejle, a showroom in Copenhagen and a studio in Lyon. Nothing in it is real.

- 12 sales pages (the playbook and the deal notes) with amounts, dates, owners and stages.
- 8 meeting notes.
- 6 HR and policy pages.
- 6 product specs.
- 4 support runbooks.
- 4 pages in French, because the embedder is multilingual.

Every page is 300 to 1200 words, has H2 and H3 headings, at least one list, and ten of them
carry a table. Exactly two pages are archived.

The facts are consistent across pages: one deal has one amount everywhere (the
Brightwater Museum is 1,450,000 euros on its deal note and on the forecast), and the
dates, stages and owners of a deal do not drift between the note, the forecast and the
client review.

## The questions

```json
{"id":"q01","q":"…","lang":"en|fr","kind":"lexical|paraphrase|multi|fr|xl|negative|acl","asker":"u_ana|u_ben|u_chloe","expected":["slug",…]}
```

| Kind | N | What it tests |
| --- | --- | --- |
| `lexical` | 12 | a rare exact term (SKU, codename, error code) that lives in the expected page only |
| `paraphrase` | 14 | the question shares no content word with the answer sentence, so the vector side has to carry it |
| `multi` | 8 | two pages answer it, and both are listed |
| `fr` | 10 | asked in French; two of them ask about an English page |
| `xl` | 14 | asked in one language, answered by a page written in the other one: ten asked in French about an English page, four asked in English about a French page |
| `negative` | 4 | nothing in the corpus answers it, so `expected` is empty |
| `acl` | 6 | the only answer is on a page the asker may not read, so `expected` is empty — and the same question from a reader who may read it expects that page |

`asker` reads per the bridge rule (`scripts/bridge-page-read.mjs`,
`canReadPageRowAsMember`): all three users are members of the one workspace, a `shared`
page is readable by every member, a `public` page by anybody, and a `private` page only by
its owner and its collaborators. An archived page answers nothing to anybody: the RAG
migration deletes the chunks of an archived page, so it is out of the index.

### The cross-lingual questions

The `xl` questions are the ones that ask in French about an English page (and the other way
round). The lexical half of the search is blind on them: the `simple` dictionary matches
whole tokens, and a French token is not an English one. So the gate holds them to a
stronger rule than the other kinds — no content word of the question is a token of the
expected page, and no rare term at all. A question with "stock" in it, when the expected
page has "stock", fails the gate: the lexical half would have a way in, and the question
would not measure what it says it measures.

The `fr` questions are the same-language control. Eight of the ten ask about a French page;
two (q35, q36) ask about an English page, and they are the misses of the baseline.

### Answer markers

A question that has an answer names it in the corpus: the answer sentence ends with
`<!-- answer:qNN -->`. The marker is stripped by the seed, so the indexed text carries no
trace of it, and `check.mjs` uses it to find the answer sentence and to hold the question
to it.

### Two places where the brief does not add up

The brief lists six counts — 12 lexical, 14 paraphrase, 8 multi, 6 fr, 4 negative, 6 acl —
and they add up to fifty, but the schema line names only five kinds. This implementation
keeps the six buckets and the schema's fields, so the sixth bucket carries `kind: "fr"`
and `lang: "fr"`. A reader that groups by `kind` sees the six numbers of the brief; a
reader that groups by `lang` sees six French questions and forty-four English ones.

The brief also says the acl questions include the same question asked by a reader who can
read the page, and that those are counted in the six. They are: two of the six are the
readable twin of a refused question, four are refused.

### What the set holds today

The set grew to sixty-eight questions: the fifty of the first brief, plus the eighteen of
the cross-lingual one. The kind table is above, and the gate holds the counts.

One of the fifty is broken and was left alone: **q35** asks u_chloe for the commercial
value agreed with the Northlake Hotels Group, and that page is private to u_ana (u_ben is a
collaborator). u_chloe may not read it, so no retrieval can answer q35, and every variant
scores 0 on it. The `fr` bucket is therefore capped at 0.90 for every variant, and the
gate of the cross-lingual brief (fr ≥ 0.8) is harder than it looks. Fixing it is a
one-line change (ask it as u_ben), but the golden set is a regression gate: changing a
question to move a number is the one thing it must never do.

## Running it

```sh
node services/osionos-ai/eval/check.mjs     # the gate; exits non-zero on any disagreement
node services/osionos-ai/eval/seed.mjs      # the SQL for osionos_pages, on stdout
```

The seed is idempotent (`ON CONFLICT (id) DO UPDATE`) and its ids are uuid v5 values
derived from the slug, the workspace name and the user key, so two runs write the same
rows. Apply it with:

```sh
node services/osionos-ai/eval/seed.mjs | psql "$DATABASE_URL"
```

## The runner

```sh
sh services/osionos-ai/eval/run.sh <osionos-ai-migration.sql> <osionos-ai-rag-migration.sql>
```

`run.sh` builds a throwaway stack and nothing else: a private Docker network (with the
same explicit-subnet fallback as `scripts/test.sh`, because Docker's default address pool
is exhausted on a busy host), a throwaway `pgvector/pgvector:0.8.0-pg16` named `ai-eval-db`
with the fixture of the test harness (`fixture.sql`, shared with `scripts/test.sh` — the
SQL is written once) and the two migrations, and a throwaway
`ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4` named `ai-eval-tei` with the real
embedder (`intfloat/multilingual-e5-small`, the model is cached in the volume
`osionos_ai_models_tei`, so it is not downloaded again). The service is not published: it
is reachable only from the network of the run. Every container and the network are removed
when the script exits, whatever happens.

`run.ts` then measures, on that stack:

- the seed is applied and the three users are made members of the one workspace;
- the real indexer runs until `ai_index_queue` is empty (the report holds the chunk count
  and the indexing time);
- every question is asked through `retrieve()` — the retrieval of the service, unchanged —
  as its asker, with `limit: 5`;
- recall@5 and MRR per kind and overall, over the questions that have a non-empty
  `expected`;
- the leaks: a returned page the asker may not read (under the bridge's own rule,
  `canReadPageRowAsMember`), or an archived one. They must be ZERO, and a leak ends the
  run with exit 1;
- the top fused score of the negative questions, so a reader can see whether a threshold
  could separate them (no threshold is added);
- the latency of `retrieve()`, p50 and p95, the embedding included.

The report is written to `RESULTS.md`. The runner measures: it never tunes the retrieval,
and the numbers are what they are.

### The variants

`AI_EVAL_VARIANTS` picks the variants of the retrieval the runner measures, on the same
corpus, the same index and the same questions:

| Variant | What it does |
| --- | --- |
| `A` | `retrieve()`, the retrieval of the service, unchanged. The default, and the baseline of every comparison |
| `B` | the vector list is run once per language (the language of every chunk is read with the detector of `text.mjs`), and the lexical list and every per-language list are fused with the same RRF |
| `C` | the query is rewritten in English and in French by a small local LLM, and the lexical and the vector list of every rewrite are fused with the same RRF |
| `D` | B and C together: every query (the question and its two rewrites) gets a lexical list and a vector list per language |

```sh
AI_EVAL_VARIANTS=all AI_EVAL_RESULTS_FILE=RESULTS-multilingual.md \
	sh services/osionos-ai/eval/run.sh <migration> <rag-migration>
```

One variant writes the report of the golden set (`RESULTS.md`); several variants write the
comparison of the experiment (`RESULTS-multilingual.md`, with the gate of the brief, the
latency of each variant, the cosine of the negative questions and the cross-lingual
questions one by one).

The variants C and D need the LLM, so `run.sh` starts a throwaway
`ghcr.io/ggml-org/llama.cpp:server-b11580` named `ai-eval-llm` with the model volume of
the deployment (`osionos_ai_models_llm`) mounted READ-ONLY, `--cpus 8 --memory 6g`, the
model found by `find /models -name '*Q4_K_M*.gguf'`. It is on the network of the run and
removed with the rest. The LLM is asked for a JSON array with the question in English and
the question in French, at temperature zero; its latency is measured on its own and never
hidden inside the latency of the retrieval.

`AI_EVAL_DEBUG=1` prints the rewrites of the LLM and the pages of every answer: it is
the way to see what a variant returned, question by question.

The production code is not touched by any of this: the variants live here, in `eval/`.

### The bite of the leak check

The leak check is worth nothing if it cannot fail. `AI_EVAL_SKIP_ACL_FILTER=1` makes the
acl questions whose answer the asker may **not** read run as the OWNER of the page that
answers them, and scores them as the asker: the private pages come back, and the leak
check must catch them. The run then ends with exit 1.

```sh
AI_EVAL_SKIP_ACL_FILTER=1 AI_EVAL_RESULTS_FILE=RESULTS-bite.md \
	sh services/osionos-ai/eval/run.sh <migration> <rag-migration>
```

## The caveat

The text is synthetic, written by a model. Recall measured on it is a regression gate —
it tells you when a retrieval change breaks something — and it is not a quality claim
about real workspaces.

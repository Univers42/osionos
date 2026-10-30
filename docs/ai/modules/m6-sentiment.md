# M6 — Sentiment: the Pulse and the thread mood

The slice of the school module IV.4 for text sentiment: the comments of a workspace that opted in are
scored negative / neutral / positive by a model on our own servers, and the result is shown **only as
totals of at least 5 people** — a weekly Pulse in Settings and one line on top of a comment thread.

Everything here is bound to the conditions **C138–C149** of the M6 sentiment devil verdict, kept with the
project's review records outside this repository. The out-of-scope of this slice is written at the bottom.

**Status: ai-dev only. The public stack stays OFF** (C147, C149): the licence of the model is undeclared
and "ship" waits for the legal check.

---

## What an evaluator does in three minutes

Needs the worker (`OSIONOS_SENTIMENT_URL` set, TEI serving the pinned model) and the sentiment migration
(`models/osionos-ugc-sentiment-migration.sql`, groot PR #118) on the **isolated eval stack** — never the live one.

**1. Switch it on.** Open Settings › AI, section "Sentiment", as an owner or admin of the workspace. Turn the
switch on. A member who is not an owner or admin sees "Only a workspace owner or admin can change this."

**2. Post the comments.** A Pulse week needs 5 distinct authors, so post comments on one page from 5 accounts.
The Pulse counts completed weeks only, so move that thread into the past. **Eval stack only** (the SQL
rewrites history; never run it anywhere else):

```sql
-- after the 5 comments exist and the worker has scored them
update public.osionos_page_comments
   set created_at = date_trunc('week', now()) - interval '3 days'
 where page_id = '<the page id>';
```

Scores are keyed by the comment content, not its date, so they stay valid.

**3. See the Pulse.** Reload Settings › AI: one bar for last week, split by tone. With 4 authors the week is
absent, not zero. The same numbers sit in a visually hidden table for screen readers.

**4. See the hint.** Open the comment thread of that page (the speech-bubble button of the page header). The
top line reads "Thread mood: Mostly positive (72 %)" (the real words and share depend on the comments). Hover:
it says the number is an aggregate of at least 5 people. With 4 authors there is no line.

**5. Switch it off.** Every score of the workspace is deleted in the same transaction (C143). The Pulse is
gone and the thread line too.

---

## The commands (the gates)

```sh
# The service (throwaway Postgres + Redis, the AI migrations incl. moderation and sentiment, the suite).
# Run from the repository root. ../ops holds the shared gate scripts; <groot> is
# the groot worktree root, holding models/osionos-ugc-sentiment-migration.sql.
AI_MIGS="$(sh ../ops/ai-migs.sh osionos-ugc-moderation-migration.sql) <groot>/models/osionos-ugc-sentiment-migration.sql" \
  sh ../ops/gate-batch.sh "$PWD" m6p svc-tsc ai

# The client.
bash scripts/docker-run.sh test-canvas
bash scripts/docker-run.sh typecheck
bash scripts/docker-run.sh lint
```

---

## What proves what

| Condition | What it says | Where it is proved |
|---|---|---|
| **C138** | Opt-in per workspace, live owner/admin only | `services/osionos-ai/tests/sentimentSettings.test.ts`; Pulse and mood: a non-member gets 404, disabled gives `enabled:false` / `mood:null` — `tests/sentimentPulse.test.ts` ("C138 disabled") |
| **C139** | Text only | the handler refuses any other `subject_kind` — `tests/sentimentHandler.test.ts` |
| **C140** | No surface per person, k >= 5 | `ai_sentiment` has no author column; the Pulse `HAVING count(distinct author) >= 5` — `tests/sentimentPulse.test.ts` ("C140 k", "C140 current week", "C140 mood"); the client shows a gap, never a zero — `tests/canvas/ai-sentiment-pulse.test.ts` |
| **C141** | A score is shown only where the subject is readable | the page row rule of `retrieval/acl.ts` (`pageRowReadableSql`) in the Pulse, `canReadPageRowAsMember` for the mood — "C141", "C140 mood" |
| **C142** | A stale score never counts | the score joins on the sha256 of the current content — "C142 a stale score" |
| **C143–C148** | Erase, no moderation use, locked storage, off on public, pinned model | migration and handler slices (PR #99, groot PR #118) |
| **C149** | The gaps are stated | the Caveat below |
| **C155** | The "AI sentiment" database property reads labels through the kit's `autofill` host adapter, read-only | `tests/canvas/ai-sentiment-rows.test.ts`; in a browser, labels for an opted-in workspace and "—" with no row read otherwise — `tests/e2e/ai-stub/aiSentimentProperty.spec.mjs` (`PLAYWRIGHT_AI_STUB=1`) |

---

## The measure (A1, osionos PR #96)

Copied from `services/osionos-ai/spikes/a1/results/encoders/RESULTS.md` on `feat/ai-spike-a1-enc2`; not re-measured here.
Test set: 2610 rows, 870 per language (`tyqiangz/multilingual-sentiments` test, negative/neutral/positive).
Baseline: TF-IDF (1-2 grams) + logistic regression trained on each language's train split — the course lesson
`05/05`. CI: paired bootstrap 95% of (model macro-F1 − baseline macro-F1), 1000 resamples, seed 42.

```sh
cd services/osionos-ai/spikes/a1 && sh encoders.sh sentiment2     # run 2026-10-22
```

| Model | en | fr | es |
|---|---|---|---|
| `cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual` (macro-F1) | 0.712 | 0.723 | 0.697 |
| TF-IDF + LR baseline (macro-F1) | 0.503 | 0.542 | 0.502 |
| Paired difference, CI 95% | +0.209 [+0.170, +0.252] | +0.181 [+0.136, +0.224] | +0.195 [+0.158, +0.238] |

The confusion matrices of the model and of the baseline, per language, are in the same RESULTS.md (rebuilt
by `services/osionos-ai/spikes/a1/encoders/sentiment-matrices.py`, which asserts the macro-F1 above).

The pinned model: revision `82107f4ccba672c9ab1eee538e727e462cad21de`, served by TEI `/predict`. Single text
p50 17.5 ms, batch of 32 p50 612.7 ms, RSS 2.32 GiB — measured with host load 12–17, so latencies are upper bounds.

---

## Caveats

**Caveat:**
- **The licence is undeclared** (C149). Neither the model card, the hub metadata, the base model nor the training
  set declares one. The public stack stays off until the legal check.
- **The model learned from tweets.** The test set above is reviews and other text, not tweets, and the gain holds
  there; that is still not osionos text.
- **osionos text is unmeasured.** No labelled osionos comments exist; 0.70–0.72 is a public multilingual set, not our
  data. Re-measure on labelled osionos comments before trusting a bucket.
- **k-anonymity is not differential privacy.** A bucket of at least 5 authors hides who wrote what, not that the
  bucket moved: an edit or a delete of an old comment changes a past week. Only completed weeks are shown, which
  stops diffing two requests to learn one new comment, and nothing more.
- **The thread mood includes the current week** and a thread at exactly 5 authors can flip on one new comment.
- The logits were not compared one by one against `transformers` (TEI logs a "Starting Bert model" notice for it).

---

## What this slice does NOT do

- **No audio, no transcripts, no images, no video** (C139). Text comments of pages only.
- **No per-person view** (C140): no route, column or chart is keyed by author.
- **No moderation, ranking or decision about a person** (C144): the score is display-only.
- No feed comments: out of this slice. The database "AI sentiment" property only **shows** labels the
  service already has; it never writes `page.properties`, and a build without an AI service does not offer it.
- No public rollout (C147, C149).

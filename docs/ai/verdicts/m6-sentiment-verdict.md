# M6 sentiment — devil verdict (2026-10-23, Claude acting as the devil)

**Ruling: PROCEED-WITH-CONDITIONS, C138–C149.**

## What is ruled on

A job of kind `sentiment` on `ai_jobs` scores workspace text with the A1 pick:
- the model is `cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual`, served by TEI `/predict` (osionos #96);
- the labels are negative, neutral and positive.

Three surfaces read the result:
1. an "AI sentiment" database property;
2. a workspace Pulse chart;
3. a thread-mood hint.

## Risk scores

Scores run 1–5; the worst axis is confidence.

| Axis | Score | Reason |
|---|---|---|
| Blast radius | 2 | A new table and a new job kind. A trigger sits on `osionos_page_comments`, which is a hot write path |
| Reversibility | 2 | Disabling deletes every derived row. The migration is additive |
| Cost on failure | 3 | A per-person mood profile of employees is a GDPR and workplace-surveillance harm |
| Confidence | 4 | The licence is undeclared. The model was trained on tweets. Accuracy on real osionos text is unmeasured |

## Assumptions

Each assumption was checked against the code or is named as unverified.

- Text sentiment is not biometric. EU AI Act Art. 5(1)(f) bans emotion recognition from biometric data (voice, face) in workplaces and schools. So text is allowed, while audio, images and video stay out.
- `osionos_page_comments.author_id` exists (`models/osionos-comments-migration.sql:11`).
- `ai_jobs.kind` already allows `'sentiment'` (`models/osionos-ai-jobs-migration.sql:32,49`).
- The moderation triggers are the pattern to follow: transition tables, the `osionos.ai_jobs` off switch, a swallowed EXCEPTION and NOTIFY (`models/osionos-ugc-moderation-migration.sql:334-403`).
- `ai_erase_user()` dispatches erasure to other modules dynamically through `to_regprocedure` (`models/osionos-user-events-migration.sql:606-621`).
- **Unverified:**
  - the licence of the cardiffnlp model;
  - its macro-F1 on osionos text (measured: 0.70–0.72 on a public multilingual set, with host load 12–17).

## Conditions

| # | Condition |
|---|---|
| C138 | **Opt-in per workspace, off by default.** Only a live owner or admin can switch it, checked against `osionos_workspace_members` at request time. The session token's roles are never trusted, because membership can be up to an hour stale |
| C139 | **Text only.** No audio, transcripts, images or video, ever, and the job handler refuses any other `subject_kind` |
| C140 | **No surface per person.** No route or column returns sentiment keyed by author. `ai_sentiment` has no `author_id`. Pulse aggregates with k ≥ 5 distinct authors per bucket; a smaller bucket is suppressed (absent, not zero). The thread hint needs ≥ 5 distinct authors in the readable thread |
| C141 | **Readers see a score only where they can read the subject.** Every read joins the live subject and its page ACL (`canReadPageRowAsMember` for rows and comments) |
| C142 | **Stale verdicts never land.** A result is written only when the subject's current content sha equals the one scored (the C89 pattern) |
| C143 | **Every derived row goes with its source.** Turning a workspace off deletes all of its rows in the same transaction. Deleting a comment deletes its row. `ai_sentiment_erase_user(uuid)` is dispatched from `ai_erase_user` |
| C144 | **Sentiment never feeds moderation, ranking or any decision about a person.** It is display-only. A test greps that `src/moderation` and `src/recs` do not import it |
| C145 | **Locked-down storage.** Service-role-only RLS on the new tables (as C43), and no client table access |
| C146 | **The enqueue never fails the user's write** (EXCEPTION → WARNING) and honours `osionos.ai_jobs = 'off'` |
| C147 | **Off on the public stack.** The worker for `sentiment` starts only when `OSIONOS_SENTIMENT_URL` is set; the public overlay sets it empty. `ai-public-flags-off.sh` is extended |
| C148 | **The model is pinned** (id, revision, sha256) and its labels are a closed enum. A model whose `id2label` is not {negative, neutral, positive} fails loudly, as the L1 handler does |
| C149 | **The eval sheet states the gaps.** It reports the undeclared licence, the tweet-domain mismatch and the measured macro-F1 against the TF-IDF+LR baseline, with CIs. "Ship" on the public stack waits for the licence check |

# M3 — Recommendations: "For you", from an event log and an iALS model

The slice of the school module "ML recommendation system". The app records what
a user does in an event log (`ai_events`), a Python job trains an implicit-feedback
matrix-factorisation model from that log, the bridge serves a "For you" strip of
pages from the model, and an admin chart shows whether the model improves.

Everything here is bound to the conditions **C48–C57** of
`a2-events-voice-verdict.md`. The out-of-scope of this slice is written at the
bottom.

**Status.** The code is merged. On the public stack the passive beacon is
opt-in and off by default (C48), so the log holds no passive events and the
nightly job skips with `insufficient_data`. The nightly job is wired by groot
PR #113 (state MERGED at 2026-10-22T22:06:01Z, `gh pr view 113 -R Univers42/groot`).
The lead recorded the skip live on 2026-10-23; this sheet does not reproduce it.

---

## What an evaluator does in three minutes

**1. The model and its numbers (no stack needed).** Run the two commands in
"The numbers" below: the pure test suite (40 passed) and the simulated offline
evaluation (iALS 0.1154 nDCG@10 against popularity 0.0775). Every number from
the simulation is **SYNTHETIC**.

**2. The bridge side (no stack needed).**

```sh
docker run --rm --network none -v "$PWD":/app:ro -w /app node:22-bookworm-slim \
  node --test tests/bridge/bridge-events.test.mjs tests/bridge/bridge-personalization.test.mjs \
  tests/bridge/bridge-recs-answer.test.mjs tests/bridge/bridge-recs-health.test.mjs \
  tests/bridge/bridge-recs-model.test.mjs tests/bridge/bridge-recs-not-interested.test.mjs \
  tests/bridge/bridge-recs-slate.test.mjs tests/bridge/bridge-recs.test.mjs
```

**3. The switches (Settings › Privacy).** `src/features/settings/ui/RecommendationPrivacy.tsx`
has two toggles, a download and a clear. "Use my activity for suggestions"
(`capture_explicit`, default on) covers likes, comments and the like. "Use the pages
I see and open to improve recommendations" (`beacon_consent`, default **off**)
covers views, impressions and clicks. "Download my activity" and "Clear my
activity" are next to them (the clear needs a second click).

**4. The strip (ai-dev stack, flag on).** With `OSIONOS_RECS_FOR_YOU=1` on the
bridge, the Home tab shows a "For you" strip. Each card has a "why" and a
"Not interested" button. A user who opted out, has no history, or sees no
model gets no strip (see Caveat).

**5. The chart (admin).** Admin space › "Recs health": nDCG@10 of each trained
model over time, and the daily click-through, with real and synthetic counted apart.

---

## The commands (the gates)

```sh
# The model: lint, format, tests, simulated evaluation (README: "The gates").
pip install --no-cache-dir --only-binary=:all: -r services/osionos-ml/requirements.txt
ruff check services/osionos-ml
ruff format --check services/osionos-ml
pytest -q services/osionos-ml/tests
(cd services/osionos-ml && python -m osml.evaluate)

# The job against a throwaway Postgres (needs the groot worktree for the fixture).
sh services/osionos-ml/scripts/test-db.sh /path/to/the/groot/worktree

# The database half (groot repo; each one starts its own throwaway Postgres).
sh scripts/verify/ai-events.sh       # log, triggers, partitions, erase/export
sh scripts/verify/rec-beacon.sh      # beacon: consent, dedup, cap, rights
sh scripts/verify/rec-factors.sh     # registry, promote, prune, erase, export
sh scripts/verify/rec-serving.sh     # context function, nearest search

# The client.
bash scripts/docker-run.sh test-canvas   # includes tests/canvas/recs-beacon.test.ts, recsHealthSeries.test.ts
```

The four groot scripts and `test-db.sh` were **not** re-run for this sheet.
They are listed because they prove the database claims below.

---

## The numbers

Run on 2026-10-23, `services/osionos-ml` at this branch, in
`python:3.12-slim` with `libgomp1` and `requirements.txt` installed
(python 3.12.15, implicit 0.7.3, numpy 2.5.3, scipy 1.18.1, pytest 9.1.1).

**1. The pure tests: 40 passed, 13 skipped.**

```sh
docker run --rm -v "$PWD/services/osionos-ml":/w -w /w python:3.12-slim sh -c \
  'apt-get install -y -qq libgomp1; pip install -q --only-binary=:all: -r requirements.txt; python -m pytest -q -rs tests'
# 40 passed, 13 skipped, 1 warning in 11.04s
```

The 13 skipped are all in `tests/test_job_db.py` ("DATABASE_URL is not set").
They need a database; `scripts/test-db.sh` provides one. They are SKIPPED, not
passed.

**2. The simulated evaluation: SYNTHETIC.**

```sh
(cd services/osionos-ml && OPENBLAS_NUM_THREADS=1 python -m osml.evaluate)
```

Defaults: 2000 users, 3000 items, 20 topics, 60000 events, seed 42 (docstring of
`osml/evaluate.py:3-4`).

| system (SYNTHETIC) | nDCG@10 | recall@20 | coverage@20 | novelty@10 |
|---|---|---|---|---|
| iALS | 0.1154 | 0.1247 | 0.0797 | 6.944 |
| popularity | 0.0775 | 0.0929 | 0.0068 | 5.482 |
| random | 0.0020 | 0.0026 | 0.9993 | 13.272 |

Coverage and novelty are read with the gate, not against it. Random covers almost
the whole catalogue and is the most novel because it ignores the user. iALS reaches
about 12× the coverage of popularity with more novel items, and it ranks higher too.

iALS minus popularity: **0.0379**, paired bootstrap 95% CI **[0.0322, 0.0433]**
(1000 resamples over users). The lower bound is above zero.

The re-run reproduced `results/sim/RESULTS.md` exactly: `diff` of the committed
`RESULTS.md` and `metrics.json` against the re-generated ones printed nothing.
Both were generated in a copy, so the committed files are unchanged.

**3. The bridge tests: 106 passed, 0 failed** (command in step 2 above,
`node --test`, 24 suites).

---

## How it works

**Data.** Capture is by database triggers on the engagement tables (likes,
reactions, shares, comments, page comments, favorites, accepted connections):
`models/osionos-user-events-migration.sql:336-534`. They check
`capture_explicit` first (e.g. `:328`). The log is `public.ai_events`, partitioned by month
(`:108`), pruned to 180 days by `ai_events_maintain()` (`:205`). The beacon
writes views, impressions and clicks through `ai_events_beacon()`
(`models/osionos-rec-beacon-migration.sql:43`). It reads `beacon_consent`
(`:60-63`, no row = no consent), keeps one row per user, item, event, surface
and UTC day, and caps a user per day (`54000`, `:73`).

**Beacon route.** `POST /api/events/beacon` (`scripts/bridge-events.mjs:16`).
Order: flag, session, bucket, body, consent (`:172`), signed slate (`:176`),
ACL read, write. A body claiming `consent: true` is ignored. The client queue
is `src/features/recs/api/beacon.ts` (`createBeaconQueue:105`,
`reportImpression:192`, `reportClick:197`). A card counts as an impression when
half of it is on screen (`ForYouStrip.tsx:106-118`).

**Model.** `implicit` ALS with confidence `1 + alpha * weight` (Hu, Koren,
Volinsky 2008): `osml/train.py:35` (`confidence_matrix`), `:46` (`train_ials`).
Event weights live in one place, `osml/events.py`. Hyperparameters are tuned on
a validation split (`train.py:75`). Time split per user: `osml/split.py`.

**Online fold-in.** A new action moves the user's vector without retraining:
the exact iALS user step, `osml/foldin.py:43` (Python reference) and
`scripts/bridge-recs-model.mjs:176` (`foldIn`, Cholesky solve, no inverse).
The README states cosine 1.000000 between the stored vector and the fold-in.
The "why" of a card is the same linear algebra (`explain`, `bridge-recs-model.mjs:207`),
following Hu et al. 2008 section 5.

**Nightly job and promotion guard.** `python -m osml.job` (`osml/job.py:48`):
window of 180 days, 7-day holdout. A candidate is trained on events before the
holdout (the "twin"). The champion is **refitted** on the same events and scored
on the same holdout. Promoted only if no champion exists or the twin's nDCG@10
is not lower (`job.py:176`, `_promotable`). Otherwise it stays a candidate and
is pruned after 7 days. Fewer than 20 users (`MIN_USERS = 20`, `job.py:45`) or no
holdout is a **skip**: one log line `"skipped": "insufficient_data"` (`job.py:76`),
exit 0. Scheduled at 03:30 UTC by the `osionos-ml-job` service in the `ai`
profile (`docker-compose.yml`, groot, `osionos-ml-job`, merged by PR #113).
Registry tables: `models/osionos-rec-factors-migration.sql` (`ai_rec_models:167`,
`ai_rec_item_factors:220`, `ai_rec_user_factors:240`, `ai_rec_promote:267`).

**Serving.** `GET /api/recs/for-you` (`scripts/bridge-recs.mjs:16`, flag
`OSIONOS_RECS_FOR_YOU=1` at `:77`). One RPC reads the context
(`ai_rec_user_context`, `rec-serving-migration.sql:196`); an opted-out user
gets `{"opted_out": true}` and nothing else (`:219`). The user is folded in, the
nearest pages come from `ai_rec_nearest` (`:400`), then filtered (refused,
touched, archived, unreadable, own, blocked: C55), diversified with MMR
(`bridge-recs-model.mjs:256`) and signed (`bridge-recs-slate.mjs`).
"Not interested" is `POST /api/recs/not-interested`
(`bridge-recs-not-interested.mjs:16`); it accepts only a page of a slate the
bridge signed for that user (C49). The strip is
`src/features/recs/ui/ForYouStrip.tsx` ("Not interested" at `:196`), mounted at
`src/widgets/page-renderer/ui/HomeTabView.tsx:90`.

**Improves over time.** `ai_rec_health(p_days)`
(`models/osionos-rec-health-migration.sql:20`) returns aggregates only (no user
or item id). `GET /api/admin/recs/health` (`scripts/bridge-recs-health.mjs:36`,
admin gate first) feeds `src/widgets/admin-space/ui/RecsHealth.tsx` ("Recs
health", `:59`). Real and synthetic series are separate
(`recsHealthSeries.ts`).

**Export and erasure (C54).** `/api/personalization/activity` GET downloads and
DELETE erases (`scripts/bridge-personalization.mjs:27-28`). Download calls
`ai_export_user` (`:127`) and the derived-state `ai_rec_export_user`
(`:145`; `rec-factors-migration.sql:423`). Erasure calls `ai_erase_user` (`:157`),
which resolves `ai_rec_erase_user` (`rec-factors-migration.sql:380`) at call time
(`:118`); `rec-factors.sh` is the proof.

---

## Conditions

| Condition | What it says | Where it holds |
|---|---|---|
| **C48** | Beacon is opt-in, consent is server-side; opt-out stops use | `ai_events_beacon` returns 0 without `beacon_consent` (`rec-beacon-migration.sql:60-63`); route 204 (`bridge-events.mjs:172`); default false (`user-events-migration.sql:92`); opted-out user gets no slate (`bridge-recs.mjs:198`) |
| **C49** | Beacon accepts only what the server vouches for | bridge route, signed slate, ACL read, rank from the slate (`bridge-events.mjs:176-190`); at most 50 events (`:64`, `parseBody:92`) |
| **C50** | One account cannot move a global aggregate | one row per user, item, event, surface, UTC day (`rec-beacon-migration.sql:11`); proved by `rec-beacon.sh` |
| **C51** | Triggers never fail or over-capture | statement-level triggers, `user-events-migration.sql:298-534`; proved by `ai-events.sh` |
| **C52** | Partitions and retention have a runner | `ai_events_maintain` (`:205`) and `ai_events_default_rows()` (`:274`), called by the indexer's `MaintenanceRunner` every 6 h under an advisory lock (`services/osionos-ai/src/indexer/main.ts:91`, `src/maintenance/runner.ts:16-20`) |
| **C53** | The log is minimal and locked down | columns are ids, enums, numbers, a timestamp (`:108`); service-role-only RLS (`:174-176`) |
| **C54** | Erasure and export cover derived state | `ai_rec_erase_user`, `ai_rec_export_user`; Settings buttons |
| **C55** | A slate never exposes another person's signal | ACL and block filter (`bridge-recs.mjs:35-41`, `bridge-recs-pages.mjs`) |
| **C56** | Synthetic data never reaches real users | `is_synthetic` on the job's rows (`README.md`), real/synthetic apart in `RecsHealth`. The refusal of live origins by a synthetic bootstrap: UNKNOWN, not located |
| **C57** | Database topology decided before the triggers ship | The job reads `osionos-ai-db` (compose service above). Whether production uses grobase Postgres: UNKNOWN, the verdict's U1 |

---

## Caveats

- **Caveat: the simulator is not users.** Every offline number is SYNTHETIC: a
  Zipf popularity and a Dirichlet taste per user. It shows that iALS can recover
  a known structure better than popularity. It says nothing about whether real
  osionos users prefer the strip.
- **Caveat: the champion check compares procedures.** The champion is refitted
  on today's events, not scored with its stored weights (which saw part of the
  holdout). A quiet week gives few holdout users and a noisy comparison;
  `holdout_users` is stored with the metrics.
- **Open condition: no non-personalised fallback (C48 not met yet).** The
  verdict asks that "For you" serve a non-personalised ranking when consent
  is off. The code does not, and plan slice `m3-fallback` fixes it: the route answers `personalized: false` with a reason (`no_model`,
  `cold_start`, `opted_out`) and the strip stays empty (`ForYouStrip.tsx:86`).
- **Caveat: comments and code disagree on the beacon bucket.** The bridge
  header and a comment say "hour"; the migration and `rec-beacon.sh` say UTC
  day. The database decides, so the day is what holds.
- **Caveat: the job skips a night the container is down** (compose comment), and
  a model is as fresh as the last nightly run (up to 24 h).
- **Caveat: no click-through number is claimed.** There is no real traffic on
  the public stack, so the chart is empty there.

---

## Out of scope

- The "People you may know" surface and any per-surface recommender other than
  pages.
- A non-personalised ("trending") ranking for users without a model.
- Approximate-nearest-neighbour search (the nearest read is the database's).
- Any recommender other than iALS. The code mentions no EASE (Steck 2019), so
  none is described.
- Real-traffic quality numbers. They need consenting users first.
- Measured like-latency overhead of the triggers (C51's artifact): not
  measured in this sheet.

## Reading

Hu, Koren, Volinsky, *Collaborative Filtering for Implicit Feedback Datasets*, ICDM 2008.
Rendle, Krichene, Zhang, Anderson, *Revisiting the Performance of iALS on Item
Recommendation Benchmarks*, RecSys 2022 (arXiv 2110.14037, 2021).
The course has no lesson on recommenders; these two are the sources.

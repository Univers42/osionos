# osionos-ml — the recommender's model (M3c-1) and its training job (M3c-3)

Implicit-feedback ALS (Hu, Koren, Volinsky 2008; Rendle et al. 2021) over the
`ai_events` log, measured offline, and the job that trains the model from the
log and writes it to the registry.

**Every offline number here is about a SYNTHETIC log.** Real users are too
few for an offline number to mean anything yet, so the evaluation runs on a
simulation and every row of it carries `is_synthetic: True`.

## What is in the box

| file | what it holds |
| --- | --- |
| `osml/events.py` | the weight of every event kind, in one place, and the weighted user x item matrix |
| `osml/simulate.py` | the synthetic log: topics, Zipf popularity, a Dirichlet taste per user |
| `osml/split.py` | the per-user TIME split: train / validation / test |
| `osml/train.py` | iALS on the CPU (`implicit`), and the grid tuned on validation |
| `osml/foldin.py` | the exact iALS user step in numpy — the reference the Node serving will match |
| `osml/metrics.py` | recall@20, nDCG@10, coverage@20, novelty@10, and the baselines |
| `osml/evaluate.py` | the CLI that runs the whole thing and writes `results/sim/` |
| `osml/store.py` | the database half: the log in, the registry row and the factors out |
| `osml/job.py` | the training job: the protocol, the promotion rule, the log line |
| `scripts/test-db.sh` | the job against a throwaway database (the groot fixture) |

## The model

`implicit`'s CPU ALS, with the confidence of an observed item at
**1 + alpha * weight** (Hu, Koren, Volinsky 2008). `implicit` scales the matrix
it is given by its own `alpha`, so `osml.train.confidence_matrix` hands it
`weight + 1/alpha` and the solver sees the confidence the paper writes down.

After the fit, one extra user step makes every stored user vector the fold-in
of the FINAL item factors — what the model holds is what `osml.foldin.fold_in`
computes, not one ALS sweep behind it. The parity test pins that: the cosine
between the two is **1.000000**.

## The training job (M3c-3)

```sh
python -m osml.job [--until ISO] [--window-days 180] [--holdout-days 7] [--synthetic]
```

The job reads `ai_events`, trains a model and writes it to the registry
(`ai_rec_models`, `ai_rec_item_factors`, `ai_rec_user_factors`) as a
**CANDIDATE**. It is promoted only when it is not worse than the champion.

| flag | what it does |
| --- | --- |
| `--until ISO` | the end of the window. Default: now. |
| `--window-days 180` | the length of the window. |
| `--holdout-days 7` | the length of the holdout (the last of the window). |
| `--synthetic` | train on the SYNTHETIC events, not the real ones. |

### Its environment

| variable | what it does |
| --- | --- |
| `DATABASE_URL` | the database. **Never printed**, not even in an error. |
| `OSML_CODE_SHA` | the code sha stamped on the model row, when it looks like a sha (`^[0-9a-f]{7,64}$`). Otherwise NULL. |
| `OSML_FACTORS` | the model's depth. Default 16. |
| `OSML_REGULARIZATION` | the model's regularization. Default 0.05. |
| `OSML_ALPHA` | the model's alpha. Default 10. |
| `OSML_ITERATIONS` | the model's iterations. Default 15. |

The database role needs service_role's grants and its `BYPASSRLS` attribute:
PostgreSQL does not inherit that attribute through a membership, and
`COPY FROM` is refused on a table with row-level security without it (the
registry's tables have RLS on).

### Its exit codes

| code | when |
| --- | --- |
| 0 | the job did its work, or skipped it (not enough data), or the model stayed a candidate. |
| 1 | something unexpected failed. The traceback is the answer. |
| 2 | the job could not start: no `DATABASE_URL`, or the database was unreachable. |

### The protocol

1. **THE WINDOW**: the events in `[until - window-days, until)`, the real
   ones or the synthetic ones — never a mix. A user who opted out
   (`ai_personalization_settings.capture_explicit` is false) is out of the
   log: their past events do not train the model. Too little data (fewer than
   20 users with enough training events, or no holdout user) is a **skip**,
   not a failure: one log line, no model row, exit 0.
2. **THE TWIN**: the candidate's hyperparameters, trained on the events
   BEFORE the holdout, and scored on the holdout — nDCG@10 and recall@20, the
   items the user has already seen excluded.
3. **THE CHAMPION** is judged on the SAME split: its own hyperparameters,
   **refitted** on the SAME training events. Its stored factors saw part of
   this holdout, so scoring them would leak. No champion: nothing to compare
   with, and the first candidate is promoted.
4. **THE SERVED MODEL**: the candidate's hyperparameters on the WHOLE window.
   Its registry row carries the **twin's** metrics —
   `{ndcg10, recall20, holdout_from, holdout_to, holdout_users,
   champion_twin_ndcg10, eval: "time-split twin"}` — not the served model's.
5. **THE PROMOTION**: only when there is no champion, or the twin's nDCG@10 is
   not lower than the champion twin's (equal is not worse). The promotion is
   forced (`ai_rec_promote(id, true)`): the database would compare the
   candidate with the champion's OLD holdout — a different week — and the
   job's comparison, on the same split, is the fair one. A model that is not
   better stays a `candidate` and is pruned after 7 days. Then the prune.

**Caveat**: refitting the champion's hyperparameters compares PROCEDURES, not
the exact served weights: the champion's row says HOW it was trained, and the
refit reproduces that procedure on today's events — it is not the same model.
The holdout is time-based, so a quiet week gives few holdout users and a
noisy comparison: the `holdout_users` count is in the metrics for that
reason.

The job writes **one JSON line** on stdout: the model id, whether it was
promoted, the two scores and the counts. No user id, no item id.

```json
{"event":"recs_job","model_id":12,"promoted":true,"ndcg10":0.1154,"recall20":0.1247,"champion_twin_ndcg10":0.1082,"users":2000,"items":3000,"events":60000,"synthetic":false,"pruned":0}
```

The job is **deterministic**: a fixed seed everywhere, so the same log gives
the same model and the same numbers, run after run.

No scheduling lives here: a later slice runs the job nightly.

## The gates

Every command runs in `python:3.12-slim` with `requirements.txt` installed
(`implicit` needs `libgomp1`, which the slim image does not ship).

```sh
pip install --no-cache-dir --only-binary=:all: -r services/osionos-ml/requirements.txt
ruff check services/osionos-ml
ruff format --check services/osionos-ml
pytest -q services/osionos-ml/tests
(cd services/osionos-ml && python -m osml.evaluate --out results/sim/)
docker build services/osionos-ml
```

The tests that need a database are marked `db` and are skipped without a
`DATABASE_URL`. `scripts/test-db.sh` builds one — a throwaway pgvector
container and a throwaway pytest container on a throwaway docker network, the
groot fixture applied, and a LOGIN role `osml_job` that has service_role's
grants and nothing more:

```sh
sh services/osionos-ml/scripts/test-db.sh /path/to/the/groot/worktree
```

`OPENBLAS_NUM_THREADS=1` is what the image sets: `implicit` asks for it, and a
threaded OpenBLAS inside its solver is slow.

## The numbers

`results/sim/RESULTS.md` holds the run the commit quotes: iALS against the
popularity and random baselines on the held-out split, with a paired bootstrap
95% interval of the difference.

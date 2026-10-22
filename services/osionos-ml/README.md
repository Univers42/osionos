# osionos-ml — the recommender's model (M3c-1)

Implicit-feedback ALS (Hu, Koren, Volinsky 2008; Rendle et al. 2021) over the
`ai_events` log, measured offline. This slice is the MODEL and its MEASUREMENT
only: no database, no route, no serving.

**Every number here is about a SYNTHETIC log.** Real users are too few for an
offline number to mean anything yet, so the evaluation runs on a simulation and
every row of it carries `is_synthetic: True`.

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

## The model

`implicit`'s CPU ALS, with the confidence of an observed item at
**1 + alpha * weight** (Hu, Koren, Volinsky 2008). `implicit` scales the matrix
it is given by its own `alpha`, so `osml.train.confidence_matrix` hands it
`weight + 1/alpha` and the solver sees the confidence the paper writes down.

After the fit, one extra user step makes every stored user vector the fold-in
of the FINAL item factors — what the model holds is what `osml.foldin.fold_in`
computes, not one ALS sweep behind it. The parity test pins that: the cosine
between the two is **1.000000**.

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

`OPENBLAS_NUM_THREADS=1` is what the image sets: `implicit` asks for it, and a
threaded OpenBLAS inside its solver is slow.

## The numbers

`results/sim/RESULTS.md` holds the run the commit quotes: iALS against the
popularity and random baselines on the held-out split, with a paired bootstrap
95% interval of the difference.

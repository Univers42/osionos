"""The nightly training job: the event log in, a candidate model out.

    python -m osml.job [--until ISO] [--window-days 180] [--holdout-days 7] [--synthetic]

The job reads the log, trains a model and writes it to the registry as a
CANDIDATE, and promotes it only when it is not worse than the champion: a
TWIN of the candidate is scored on the holdout, the champion is refitted and
scored on the same holdout, the served model is trained on the whole window
(README.md holds the protocol).

Caveat: refitting the champion's hyperparameters compares PROCEDURES, not the
exact served weights — the row says HOW the champion was trained, and the refit
reproduces that procedure on today's events. The holdout is time-based: a quiet
week gives few holdout users and a noisy comparison — `holdout_users` says so.
"""

import argparse
import json
import os
from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Any

import psycopg

from .evaluate import K_RECALL, ials_ranking, score_system
from .events import build_matrix, event_weight, index_items, index_users
from .split import MIN_EVENTS, ground_truth
from .store import champion, promote, prune, read_events, write_model
from .train import train_ials

# The seed everywhere: the job is deterministic. The same log gives the same
# model and the same numbers, run after run.
SEED = 42

# The model's defaults: the tuned values of results/sim/RESULTS.md (16 factors,
# regularization 0.05, alpha 10, 15 iterations). The environment overrides them:
# OSML_FACTORS, OSML_REGULARIZATION, OSML_ALPHA, OSML_ITERATIONS.
DEFAULT_FACTORS = 16
DEFAULT_REGULARIZATION = 0.05
DEFAULT_ALPHA = 10.0
DEFAULT_ITERATIONS = 15

# The fewest users with enough training events for the model to mean anything.
MIN_USERS = 20


def run(args: argparse.Namespace) -> int:
    """The whole run. 0 when the job did its work, or skipped it."""
    until = args.until or datetime.now(UTC)
    since = until - timedelta(days=args.window_days)
    holdout_from = until - timedelta(days=args.holdout_days)
    dsn = os.environ.get("DATABASE_URL", "").strip()
    if not dsn:
        _log({"event": "recs_job", "error": "no_database_url"})
        return 2
    params = _params()
    try:
        conn = psycopg.connect(dsn, autocommit=True)
    except psycopg.Error as error:
        _log({"event": "recs_job", "error": "database_unreachable", "detail": str(error)[:160].replace(dsn, "?")})
        return 2

    with conn:
        events = read_events(conn, since, until, args.synthetic)
        training = [e for e in events if e["ts"] < holdout_from and event_weight(str(e["event"])) > 0.0]
        # The holdout holds the positive signals: an event with no weight is not one.
        holdout = [event for event in events if event["ts"] >= holdout_from and event_weight(str(event["event"])) > 0.0]
        user_index = index_users(training)
        item_index = index_items(training)
        matrix = build_matrix(training, user_index, item_index)
        truth = ground_truth(holdout, user_index, item_index)
        users = sum(1 for count in Counter(str(e["user_id"]) for e in training).values() if count >= MIN_EVENTS)
        if users < MIN_USERS or not truth:
            _log({"event": "recs_job", "skipped": "insufficient_data", "users": users, "events": len(training)})
            return 0

        # The twin: the candidate's procedure, on the training events only.
        twin = train_ials(matrix, seed=SEED, **params)
        ndcg, recall = _score(twin, matrix, truth)
        # The champion, judged on the same split with its own procedure.
        current = champion(conn)
        champion_ndcg = None
        if current is not None:
            procedure = {key: current[key] for key in ("factors", "regularization", "alpha", "iterations")}
            champion_twin = train_ials(matrix, seed=SEED, **procedure)
            champion_ndcg, _ = _score(champion_twin, matrix, truth)

        # The served model: the candidate's procedure on the WHOLE window.
        served_events = [e for e in events if event_weight(str(e["event"])) > 0.0]
        served_users = index_users(served_events)
        served_items = index_items(served_events)
        served_matrix = build_matrix(served_events, served_users, served_items)
        served = train_ials(served_matrix, seed=SEED, **params)
        metrics = {
            "ndcg10": ndcg,
            "recall20": recall,
            "holdout_from": holdout_from.isoformat(),
            "holdout_to": until.isoformat(),
            "holdout_users": len(truth),
            "champion_twin_ndcg10": champion_ndcg,
            "eval": "time-split twin",
        }
        model_id = write_model(
            conn,
            {**params, "algo": "ials", "events_used": len(served_events)},
            metrics,
            list(served_users),
            _catalogue(served_events, served_items),
            list(served.user_factors),
            list(served.item_factors),
            args.synthetic,
            until,
        )
        promoted, refused = False, None
        if _promotable(champion_ndcg, ndcg):
            try:
                promote(conn, model_id)
                promoted = True
            except psycopg.errors.RaiseException as error:
                refused = str(error).strip().splitlines()[0]
        pruned = prune(conn)
        _log(
            {
                "event": "recs_job",
                "model_id": model_id,
                "promoted": promoted,
                "ndcg10": ndcg,
                "recall20": recall,
                "champion_twin_ndcg10": champion_ndcg,
                "users": len(served_users),
                "items": len(served_items),
                "events": len(events),
                "synthetic": bool(args.synthetic),
                "pruned": pruned,
                **({"refused": refused} if refused else {}),
            }
        )
    return 0


def _score(model: Any, matrix: Any, truth: dict[int, set[int]]) -> tuple[float, float]:
    """The model's nDCG@10 and recall@20 on the holdout, the seen items out."""
    scores = score_system(ials_ranking(model, matrix, K_RECALL), truth, matrix.shape[1], {})
    return scores["ndcg@10"], scores["recall@20"]


def _catalogue(events: list[dict[str, Any]], item_index: dict[str, int]) -> list[tuple[str, str, Any]]:
    """The items of the matrix, in its column order, with their workspace."""
    workspace: dict[str, Any] = {}
    for event in sorted(events, key=lambda event: event["ts"]):  # the most recent event's workspace
        workspace[str(event["item_id"])] = event["workspace_id"]
    return [(*key.split(":", 1), workspace.get(key)) for key in item_index]


def _params() -> dict[str, Any]:
    """The model's hyperparameters: the tuned defaults, overridable."""
    return {
        "factors": int(_env("OSML_FACTORS", DEFAULT_FACTORS)),
        "regularization": float(_env("OSML_REGULARIZATION", DEFAULT_REGULARIZATION)),
        "alpha": float(_env("OSML_ALPHA", DEFAULT_ALPHA)),
        "iterations": int(_env("OSML_ITERATIONS", DEFAULT_ITERATIONS)),
    }


def _env(name: str, default: float) -> float:
    """The environment's override, or the default."""
    raw = os.environ.get(name, "").strip() or str(default)
    try:
        return float(raw)
    except ValueError as error:
        raise ValueError(f"{name}={raw!r} is not a number") from error


def _promotable(champion_ndcg: float | None, ndcg: float) -> bool:
    """The promotion rule: no champion yet, or the candidate is not worse. The
    two numbers are the twins' scores on the SAME holdout, so they compare."""
    return champion_ndcg is None or ndcg >= champion_ndcg


def _log(payload: dict[str, Any]) -> None:
    """One JSON line on stdout: the job's whole account of itself."""
    print(json.dumps(payload, sort_keys=True), flush=True)


def main(argv: list[str] | None = None) -> int:
    """The CLI. 0 when the job ran (or skipped), 2 when it could not start."""
    parser = argparse.ArgumentParser(prog="osml.job", description="Train the recommender from the event log.")
    parser.add_argument("--until", default=None, help="the end of the window (ISO). Default: now.")
    parser.add_argument("--window-days", type=int, default=180, help="the window's length in days.")
    parser.add_argument("--holdout-days", type=int, default=7, help="the holdout's length in days.")
    parser.add_argument("--synthetic", action="store_true", help="train on the synthetic events, not the real ones.")
    args = parser.parse_args(argv)
    stamp = datetime.fromisoformat(args.until) if args.until else None
    args.until = stamp.replace(tzinfo=UTC) if stamp and not stamp.tzinfo else stamp
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())

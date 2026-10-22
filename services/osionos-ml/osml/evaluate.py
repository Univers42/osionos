"""Measure the model on a SYNTHETIC log, and write the numbers down.

    python -m osml.evaluate --users 2000 --items 3000 --topics 20 \
        --events 60000 --seed 42 --out results/sim/

The run simulates a log, splits it by time, tunes the model on the VALIDATION
split, trains it on the TRAINING split and scores it on the TEST split. It
writes `metrics.json` and `RESULTS.md` under `--out`.

The numbers are about the SIMULATION. Nothing here has read a real user.
"""

import argparse
import json
import platform
import sys
from pathlib import Path
from typing import Any

import numpy as np
import scipy

from . import __version__
from .events import build_matrix, index_items, index_users
from .metrics import (
    coverage_at_k,
    ndcg_at_k,
    novelty_at_k,
    popularity_baseline,
    popularity_shares,
    random_baseline,
    rank_items,
    recall_at_k,
    seen_items,
)
from .simulate import simulate
from .split import ground_truth, split_events
from .train import train_ials, tune

# The depth of the ranking the report is about.
K_NDCG = 10
K_RECALL = 20
# The bootstrap behind the confidence interval.
BOOTSTRAP_RESAMPLES = 1000
BOOTSTRAP_SEED = 42


def ials_ranking(model: Any, train: Any, n: int = K_NDCG) -> list[list[int]]:
    """The model's ranking for every user, without the items they have seen."""
    seen = seen_items(train)
    item_factors = np.asarray(model.item_factors, dtype=np.float64)
    user_factors = np.asarray(model.user_factors, dtype=np.float64)
    return [rank_items(item_factors @ user_factors[user], seen.get(user, set()), n) for user in range(train.shape[0])]


def score_system(
    ranked_lists: list[list[int]],
    truth: dict[int, set[int]],
    n_items: int,
    shares: dict[int, float],
) -> dict[str, Any]:
    """What a system's lists are worth, per user and in total."""
    per_user_ndcg: dict[int, float] = {}
    per_user_recall: dict[int, float] = {}
    for user, relevant in truth.items():
        if not relevant:
            continue
        ranked = ranked_lists[user] if user < len(ranked_lists) else []
        per_user_ndcg[user] = ndcg_at_k(ranked, relevant, K_NDCG)
        per_user_recall[user] = recall_at_k(ranked, relevant, K_RECALL)

    evaluated = sorted(per_user_ndcg)
    return {
        "ndcg@10": float(np.mean([per_user_ndcg[user] for user in evaluated])) if evaluated else 0.0,
        "recall@20": float(np.mean([per_user_recall[user] for user in evaluated])) if evaluated else 0.0,
        "coverage@20": coverage_at_k([ranked_lists[user] for user in evaluated], K_RECALL, n_items),
        "novelty@10": novelty_at_k([ranked_lists[user] for user in evaluated], shares, K_NDCG),
        "evaluated_users": len(evaluated),
        "per_user_ndcg@10": per_user_ndcg,
    }


def paired_bootstrap_ci(
    differences: list[float],
    resamples: int = BOOTSTRAP_RESAMPLES,
    seed: int = BOOTSTRAP_SEED,
) -> tuple[float, float]:
    """The 95% interval of the mean difference, resampled over the users.

    The two systems are compared on the SAME users in every resample, so the
    interval is about the difference and not about the users.
    """
    values = np.asarray(differences, dtype=np.float64)
    if values.size == 0:
        return 0.0, 0.0
    rng = np.random.default_rng(seed)
    draws = rng.integers(0, values.size, size=(resamples, values.size))
    means = values[draws].mean(axis=1)
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def evaluate(
    users: int = 2000,
    items: int = 3000,
    topics: int = 20,
    events: int = 60000,
    seed: int = 42,
) -> dict[str, Any]:
    """The whole run: simulate, split, tune, train, score."""
    log = simulate(users, items, topics, events, seed)
    train_events, valid_events, test_events = split_events(log)

    user_index = index_users(log)
    item_index = index_items(log)
    train = build_matrix(train_events, user_index, item_index)
    valid_truth = ground_truth(valid_events, user_index, item_index)
    test_truth = ground_truth(test_events, user_index, item_index)

    best = tune(train, valid_truth, seed=seed)
    model = train_ials(
        train,
        factors=int(best["factors"]),
        regularization=best["regularization"],
        alpha=best["alpha"],
        iterations=int(best["iterations"]),
        seed=seed,
    )

    shares = popularity_shares(train)
    systems = {
        "ials": ials_ranking(model, train),
        "popularity": popularity_baseline(train, K_NDCG),
        "random": random_baseline(train, K_NDCG, seed=seed),
    }
    scores = {name: score_system(ranked, test_truth, train.shape[1], shares) for name, ranked in systems.items()}

    evaluated = sorted(scores["ials"]["per_user_ndcg@10"])
    differences = [
        scores["ials"]["per_user_ndcg@10"][user] - scores["popularity"]["per_user_ndcg@10"][user] for user in evaluated
    ]
    low, high = paired_bootstrap_ci(differences, BOOTSTRAP_RESAMPLES, BOOTSTRAP_SEED)
    difference = float(np.mean(differences)) if differences else 0.0

    return {
        "synthetic": True,
        "config": {
            "users": users,
            "items": items,
            "topics": topics,
            "events": events,
            "seed": seed,
        },
        "log": {
            "events": len(log),
            "train_events": len(train_events),
            "valid_events": len(valid_events),
            "test_events": len(test_events),
            "users_with_test": len(test_truth),
            "matrix_nnz": int(train.nnz),
        },
        "tuned": best,
        "metrics": {
            name: {key: value for key, value in measured.items() if key != "per_user_ndcg@10"}
            for name, measured in scores.items()
        },
        "difference_ials_minus_popularity": {
            "ndcg@10": difference,
            "ci95_low": low,
            "ci95_high": high,
            "resamples": BOOTSTRAP_RESAMPLES,
            "seed": BOOTSTRAP_SEED,
            "users": len(evaluated),
        },
        "gate": {
            "ials_beats_popularity": scores["ials"]["ndcg@10"] > scores["popularity"]["ndcg@10"],
            "ci_low_above_zero": low > 0.0,
        },
        "versions": {
            "osml": __version__,
            "python": platform.python_version(),
            "numpy": np.__version__,
            "scipy": scipy.__version__,
        },
    }


def write_results(report: dict[str, Any], out: Path) -> None:
    """Write the numbers down: `metrics.json` for the machines, `RESULTS.md` for the humans."""
    out.mkdir(parents=True, exist_ok=True)
    (out / "metrics.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    config = report["config"]
    metrics = report["metrics"]
    difference = report["difference_ials_minus_popularity"]
    tuned = report["tuned"]
    log = report["log"]

    def row(name: str) -> str:
        measured = metrics[name]
        return (
            f"| {name} | {measured['ndcg@10']:.4f} | {measured['recall@20']:.4f} | "
            f"{measured['coverage@20']:.4f} | {measured['novelty@10']:.3f} |"
        )

    lines = [
        "# SYNTHETIC — the recommender's model, measured offline (M3c-1)",
        "",
        "SYNTHETIC DATA. Every number below comes from a simulated event log — no real osionos "
        "user is in it. It says how the MODEL behaves on a log with a known shape, nothing more.",
        "",
        "## The run",
        "",
        f"- log: {config['users']} users, {config['items']} items, {config['topics']} topics, "
        f"{config['events']} events, seed {config['seed']}",
        f"- split: {log['train_events']} train / {log['valid_events']} validation / {log['test_events']} test events, "
        f"{log['users_with_test']} users with a held-out item",
        f"- tuned on VALIDATION only: regularization {tuned['regularization']}, alpha {tuned['alpha']}, "
        f"{tuned['iterations']} iterations, {tuned['factors']} factors (validation nDCG@10 {tuned['ndcg@10']:.4f})",
        f"- scored on TEST: {difference['users']} users, items the user has already seen excluded",
        "",
        "| system | nDCG@10 | recall@20 | coverage@20 | novelty@10 |",
        "| --- | --- | --- | --- | --- |",
        row("ials"),
        row("popularity"),
        row("random"),
        "",
        "## The gate",
        "",
        f"iALS nDCG@10 - popularity nDCG@10 = **{difference['ndcg@10']:.4f}**",
        "",
        f"Paired bootstrap 95% CI ({difference['resamples']} resamples over the users, seed "
        f"{difference['seed']}): **[{difference['ci95_low']:.4f}, {difference['ci95_high']:.4f}]**",
        "",
        f"- iALS beats popularity: {'yes' if report['gate']['ials_beats_popularity'] else 'NO'}",
        f"- CI lower bound above zero: {'yes' if report['gate']['ci_low_above_zero'] else 'NO'}",
        "",
        "## Versions",
        "",
        f"- osml {report['versions']['osml']}, python {report['versions']['python']}, "
        f"numpy {report['versions']['numpy']}, scipy {report['versions']['scipy']}",
        "",
    ]
    (out / "RESULTS.md").write_text("\n".join(lines), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="osml.evaluate", description="Measure the recommender on a SYNTHETIC log.")
    parser.add_argument("--users", type=int, default=2000)
    parser.add_argument("--items", type=int, default=3000)
    parser.add_argument("--topics", type=int, default=20)
    parser.add_argument("--events", type=int, default=60000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=Path, default=Path("results/sim"))
    args = parser.parse_args(argv)

    report = evaluate(
        users=args.users,
        items=args.items,
        topics=args.topics,
        events=args.events,
        seed=args.seed,
    )
    write_results(report, args.out)

    metrics = report["metrics"]
    difference = report["difference_ials_minus_popularity"]
    print(f"SYNTHETIC run -> {args.out}")
    for name, label in (("ials", "iALS"), ("popularity", "popularity"), ("random", "random")):
        print(f"  {label:<12} nDCG@10 {metrics[name]['ndcg@10']:.4f}  recall@20 {metrics[name]['recall@20']:.4f}")
    interval = f"[{difference['ci95_low']:.4f}, {difference['ci95_high']:.4f}]"
    print(f"  iALS - popularity = {difference['ndcg@10']:.4f}  95% CI {interval}")
    print(f"  tuned: regularization {report['tuned']['regularization']}, alpha {report['tuned']['alpha']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

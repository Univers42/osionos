"""The offline metrics: what a recommendation list is worth.

The relevance here is BINARY — an item is relevant when the user held it out,
and not relevant otherwise. Two systems are compared on the same users, so a
difference in the numbers is a difference in the recommendations.
"""

import math
from collections.abc import Iterable, Mapping, Sequence

import numpy as np
from scipy.sparse import csr_matrix


def rank_items(scores: np.ndarray, exclude: Iterable[int], n: int) -> list[int]:
    """The `n` best items by score, without the ones in `exclude`.

    Ties break by item index, so the same scores always give the same list.
    """
    ranking = np.asarray(scores, dtype=np.float64)
    blocked = np.fromiter(exclude, dtype=np.int64)
    if blocked.size:
        ranking = ranking.copy()
        ranking[blocked] = -np.inf
    order = np.argsort(-ranking, kind="stable")
    return [int(item) for item in order[:n]]


def recall_at_k(ranked: Sequence[int], relevant: set[int], k: int) -> float:
    """The share of the relevant items the list holds, in its first `k`."""
    if not relevant:
        return 0.0
    hits = sum(1 for item in ranked[:k] if item in relevant)
    return hits / len(relevant)


def ndcg_at_k(ranked: Sequence[int], relevant: set[int], k: int) -> float:
    """The discounted gain of the list, over the gain of the best possible list.

    A relevant item at rank 1 counts 1/log2(2), at rank 2 counts 1/log2(3),
    and so on. The best possible list puts the relevant items first.
    """
    if not relevant:
        return 0.0
    gain = sum(1.0 / math.log2(rank + 2) for rank, item in enumerate(ranked[:k]) if item in relevant)
    best = sum(1.0 / math.log2(rank + 2) for rank in range(min(len(relevant), k)))
    return gain / best if best else 0.0


def coverage_at_k(ranked_lists: Sequence[Sequence[int]], k: int, n_items: int) -> float:
    """The share of the catalogue the lists reach, in their first `k`."""
    if n_items <= 0:
        return 0.0
    reached: set[int] = set()
    for ranked in ranked_lists:
        reached.update(ranked[:k])
    return len(reached) / n_items


def novelty_at_k(ranked_lists: Sequence[Sequence[int]], popularity: Mapping[int, float], k: int) -> float:
    """The mean surprise of the recommended items: -log2 of an item's share.

    `popularity` maps an item to its share of the interactions (a number
    between 0 and 1). An item nobody touched has no share and no surprise.
    """
    surprises: list[float] = []
    for ranked in ranked_lists:
        for item in ranked[:k]:
            share = popularity.get(item, 0.0)
            if share <= 0.0:
                continue
            surprises.append(-math.log2(share))
    return float(np.mean(surprises)) if surprises else 0.0


def seen_items(train: csr_matrix) -> dict[int, set[int]]:
    """The items every user has already been trained on."""
    matrix = train.tocsr()
    return {
        user: set(matrix.indices[matrix.indptr[user] : matrix.indptr[user + 1]].tolist())
        for user in range(matrix.shape[0])
    }


def popularity_shares(train: csr_matrix) -> dict[int, float]:
    """Every item's share of the interactions in the training matrix."""
    totals = np.asarray(train.sum(axis=0)).ravel()
    grand_total = float(totals.sum())
    if grand_total <= 0.0:
        return {}
    return {item: float(total / grand_total) for item, total in enumerate(totals) if total > 0.0}


def popularity_baseline(train: csr_matrix, n: int = 10) -> list[list[int]]:
    """The most popular items, for every user — the system to beat."""
    matrix = train.tocsr()
    scores = np.asarray(matrix.sum(axis=0)).ravel()
    seen = seen_items(matrix)
    return [rank_items(scores, seen.get(user, set()), n) for user in range(matrix.shape[0])]


def random_baseline(train: csr_matrix, n: int = 10, seed: int = 42) -> list[list[int]]:
    """Random items, for every user — the floor under the numbers."""
    matrix = train.tocsr()
    rng = np.random.default_rng(seed)
    n_items = matrix.shape[1]
    seen = seen_items(matrix)
    return [rank_items(rng.random(n_items), seen.get(user, set()), n) for user in range(matrix.shape[0])]

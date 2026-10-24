"""Fold a user in: the exact iALS user step, in numpy.

This is the reference the Node serving will match later. Online fold-in is
what lets an event move a user's vector without retraining the model: the
items the user has touched give a user vector, and the vector gives the
ranking.

The step (Hu, Koren, Volinsky 2008, section 3):

    x = (YᵀY + Yᵀ(Cᵤ − I)Y + λI)⁻¹ Yᵀ Cᵤ pᵤ

where Y is the item factors, Cᵤ the diagonal of the user's confidences
(1 + alpha * weight for an item the user touched) and pᵤ the user's
preferences (1 for those items, 0 for the rest).

The k x k system is SOLVED, never inverted, and its first term — the item
Gram matrix YᵀY — is what the registry stores with the model, so serving
folds a user in with the model's own numbers.
"""

from collections.abc import Sequence

import numpy as np


def item_gram(item_factors: np.ndarray) -> list[float]:
    """The model's item Gram matrix YᵀY, flattened ROW-MAJOR.

    `item_factors` is the model's item factors, one row per item; the result
    is `factors * factors` numbers: the first `factors` of them are the first
    ROW of the matrix, then the second row, and so on. That is the layout the
    registry stores, and it is the one serving reads back.

    The Gram is a sum over EVERY item of the model: far too big to recompute
    per request, and trivial to compute once when the model is written. It is
    the first term of the fold-in's system, `A = YᵀY + λI + Σ (cᵢ−1) yᵢyᵢᵀ`.
    """
    factors = np.asarray(item_factors, dtype=np.float64)
    gram = factors.T @ factors
    return [float(value) for value in np.asarray(gram).reshape(-1)]


def fold_in(
    item_factors: np.ndarray,
    item_ids: Sequence[int],
    weights: Sequence[float],
    regularization: float,
    alpha: float,
) -> np.ndarray:
    """The user vector of a user who touched `item_ids` with `weights`.

    `item_factors` is the model's item factors, one row per item; `item_ids`
    are the columns of the items the user touched and `weights` their summed
    event weights.
    """
    factors = np.asarray(item_factors, dtype=np.float64)
    k = factors.shape[1]

    # A = YᵀY + λI, and b = Yᵀ Cᵤ pᵤ. The Yᵀ(Cᵤ − I)Y term is added below.
    # The Gram is the one the registry stores, so there is ONE computation of
    # it: the one serving reads back.
    gram = np.asarray(item_gram(factors), dtype=np.float64).reshape(k, k)
    a = gram + regularization * np.eye(k)
    b = np.zeros(k)

    for item_id, weight in zip(item_ids, weights, strict=True):
        factor = factors[item_id]
        confidence = 1.0 + alpha * float(weight)
        a += (confidence - 1.0) * np.outer(factor, factor)
        b += confidence * factor

    return np.linalg.solve(a, b)

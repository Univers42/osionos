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

The k x k system is SOLVED, never inverted.
"""

from collections.abc import Sequence

import numpy as np


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
    a = factors.T @ factors + regularization * np.eye(k)
    b = np.zeros(k)

    for item_id, weight in zip(item_ids, weights, strict=True):
        factor = factors[item_id]
        confidence = 1.0 + alpha * float(weight)
        a += (confidence - 1.0) * np.outer(factor, factor)
        b += confidence * factor

    return np.linalg.solve(a, b)

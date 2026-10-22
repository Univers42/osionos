"""Train iALS on the weighted matrix, and tune it on the validation split.

The model is `implicit`'s CPU ALS (Hu, Koren, Volinsky 2008; Rendle et al.
2021). We do not write the maths ourselves: `implicit` is the MIT-licensed
library that does it, and no Node iALS library exists to do it there later.

The confidence an observed item carries is 1 + alpha * weight. `implicit`
scales the matrix it is given by its own `alpha`, so it is given
`weight + 1/alpha` and solves with the confidence 1 + alpha * weight.
"""

import numpy as np
from implicit.cpu.als import AlternatingLeastSquares
from scipy.sparse import csr_matrix

from .metrics import ndcg_at_k, rank_items, seen_items

# The grid `tune` walks. Small on purpose: the validation split is small, and
# a big grid would tune the noise.
#
# The DEPTH is in the grid as well, and it has to be: with the factors fixed
# at 64 the model overfits a log this small (about 30 events a user, 3 000
# items) and recommends the tail, and it LOSES to the popularity baseline.
# The validation split picks the depth the data supports — 16 factors on the
# default log — and the test split never sees the choice.
GRID_FACTORS: tuple[int, ...] = (8, 16, 32, 64)
GRID_REGULARIZATION: tuple[float, ...] = (0.01, 0.05, 0.1)
GRID_ALPHA: tuple[float, ...] = (10.0, 40.0)
# The number of ALS iterations the grid uses.
GRID_ITERATIONS = 15
# The depth of the ranking the grid is scored on.
TUNE_K = 10


def confidence_matrix(matrix: csr_matrix, alpha: float) -> csr_matrix:
    """The matrix `implicit` is given, so that its confidence is 1 + alpha * weight.

    `implicit` multiplies the matrix it is handed by its own `alpha`, so the
    weight it is given is `weight + 1/alpha`.
    """
    confident = matrix.astype(np.float64)
    confident.data += 1.0 / alpha
    return confident


def train_ials(
    matrix: csr_matrix,
    factors: int = 64,
    regularization: float = 0.05,
    alpha: float = 40.0,
    iterations: int = GRID_ITERATIONS,
    seed: int = 42,
) -> AlternatingLeastSquares:
    """Fit iALS on the weighted user x item matrix.

    After the fit, one extra user step makes every stored user vector the
    fold-in of the FINAL item factors: what the model holds is what
    `osml.foldin.fold_in` computes, not one ALS sweep behind it.
    """
    model = AlternatingLeastSquares(
        factors=factors,
        regularization=regularization,
        alpha=alpha,
        iterations=iterations,
        use_cg=False,
        random_state=seed,
        dtype=np.float32,
    )
    confident = confidence_matrix(matrix, alpha)
    model.fit(confident, show_progress=False)
    model.partial_fit_users(np.arange(matrix.shape[0]), confident)
    return model


def tune(
    train: csr_matrix,
    valid: dict[int, set[int]],
    iterations: int = GRID_ITERATIONS,
    seed: int = 42,
) -> dict[str, float]:
    """The grid's best parameters, scored by nDCG@10 on the VALIDATION split.

    The grid walks the depth, the regularization and the alpha. The test set
    is never touched here.
    """
    best: dict[str, float] = {}
    best_score = -1.0
    for factors in GRID_FACTORS:
        for regularization in GRID_REGULARIZATION:
            for alpha in GRID_ALPHA:
                model = train_ials(
                    train,
                    factors=factors,
                    regularization=regularization,
                    alpha=alpha,
                    iterations=iterations,
                    seed=seed,
                )
                score = validation_ndcg(model, train, valid)
                if score > best_score:
                    best_score = score
                    best = {
                        "factors": factors,
                        "regularization": regularization,
                        "alpha": alpha,
                        "iterations": iterations,
                        "ndcg@10": score,
                    }
    return best


def validation_ndcg(model: AlternatingLeastSquares, train: csr_matrix, valid: dict[int, set[int]]) -> float:
    """The mean nDCG@10 of the model over the users the validation split holds."""
    if not valid:
        return 0.0
    seen = seen_items(train)
    item_factors = np.asarray(model.item_factors, dtype=np.float64)
    total = 0.0
    counted = 0
    for user, relevant in valid.items():
        if not relevant:
            continue
        scores = item_factors @ np.asarray(model.user_factors[user], dtype=np.float64)
        ranked = rank_items(scores, seen.get(user, set()), TUNE_K)
        total += ndcg_at_k(ranked, relevant, TUNE_K)
        counted += 1
    return total / counted if counted else 0.0

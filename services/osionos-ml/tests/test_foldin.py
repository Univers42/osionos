"""The fold-in PARITY: the numpy reference IS the model's user step."""

import numpy as np

from osml.events import build_matrix, index_items, index_users
from osml.foldin import fold_in
from osml.simulate import simulate
from osml.train import confidence_matrix, train_ials

FACTORS = 16
REGULARIZATION = 0.05
ALPHA = 40.0


def cosine(left: np.ndarray, right: np.ndarray) -> float:
    left = np.asarray(left, dtype=np.float64)
    right = np.asarray(right, dtype=np.float64)
    return float(left @ right / (np.linalg.norm(left) * np.linalg.norm(right)))


def small_model():
    """A small model: 200 users, 300 items, 16 factors."""
    log = simulate(200, 300, 10, 6000, seed=42)
    users = index_users(log)
    items = index_items(log)
    matrix = build_matrix(log, users, items)
    model = train_ials(
        matrix,
        factors=FACTORS,
        regularization=REGULARIZATION,
        alpha=ALPHA,
        iterations=15,
        seed=42,
    )
    return model, matrix


def test_folding_a_user_in_gives_the_models_user_vector():
    model, matrix = small_model()

    for user in (0, 7, 42):
        row = matrix[user]
        vector = fold_in(model.item_factors, row.indices, row.data, REGULARIZATION, ALPHA)

        assert cosine(vector, model.user_factors[user]) >= 0.999


def test_folding_a_user_in_gives_what_the_library_recalculates():
    model, matrix = small_model()

    for user in (0, 7, 42):
        row = matrix[user]
        vector = fold_in(model.item_factors, row.indices, row.data, REGULARIZATION, ALPHA)
        recalculated = model.recalculate_user(user, confidence_matrix(matrix[user : user + 1], ALPHA))

        assert cosine(vector, recalculated) >= 0.999


def test_a_user_without_items_folds_in_to_nothing():
    model, matrix = small_model()
    empty = np.zeros(model.factors, dtype=np.float64)

    vector = fold_in(model.item_factors, [], [], REGULARIZATION, ALPHA)

    assert vector.shape == empty.shape
    assert np.allclose(vector, 0.0)

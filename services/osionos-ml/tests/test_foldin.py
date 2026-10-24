"""The fold-in PARITY: the numpy reference IS the model's user step."""

import numpy as np

from osml.events import build_matrix, index_items, index_users
from osml.foldin import fold_in, item_gram
from osml.simulate import simulate
from osml.train import confidence_matrix, train_ials

FACTORS = 16
REGULARIZATION = 0.05
ALPHA = 40.0

# A hand-made matrix of item factors: three items, two factors.
#   Y = [[1, 2], [3, 4], [5, 6]]
#   YᵀY = [[1²+3²+5², 1·2+3·4+5·6], [1·2+3·4+5·6, 2²+4²+6²]]
#       = [[35, 44], [44, 56]]
# and the row-major flattening of that is 35, 44, 44, 56.
HAND = np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]])
HAND_GRAM = [35.0, 44.0, 44.0, 56.0]


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


def test_the_item_gram_is_the_hand_computed_gram():
    gram = item_gram(HAND)

    assert gram == HAND_GRAM


def test_the_item_gram_is_row_major():
    """The first `factors` numbers are the first ROW of the matrix."""
    gram = np.asarray(item_gram(HAND)).reshape(2, 2)

    assert gram[0][0] == 35.0
    assert gram[0][1] == 44.0
    assert gram[1][0] == 44.0
    assert gram[1][1] == 56.0


def test_the_item_gram_is_symmetric():
    """YᵀY is symmetric: the number at (i, j) is the number at (j, i)."""
    factors = np.arange(1, 13, dtype=np.float64).reshape(4, 3)

    gram = np.asarray(item_gram(factors)).reshape(3, 3)

    assert np.array_equal(gram, gram.T)


def test_folding_a_user_in_still_solves_the_same_system():
    """The step is UNCHANGED: the same system, the same solution."""
    items = [0, 2]
    weights = [1.0, 2.0]
    regularization = 0.05
    alpha = 10.0

    vector = fold_in(HAND, items, weights, regularization, alpha)

    # The system, built by hand: the Gram, λI, and the confidence term of
    # every item the user touched.
    a = HAND.T @ HAND + regularization * np.eye(2)
    b = np.zeros(2)
    for item_id, weight in zip(items, weights, strict=True):
        confidence = 1.0 + alpha * weight
        a += (confidence - 1.0) * np.outer(HAND[item_id], HAND[item_id])
        b += confidence * HAND[item_id]

    assert np.allclose(vector, np.linalg.solve(a, b))

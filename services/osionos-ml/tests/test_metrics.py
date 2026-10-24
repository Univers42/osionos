"""The metrics, hand-computed.

Three users, ten items each. The numbers below are worked out by hand in the
comments, so a change in the maths cannot pass unnoticed.
"""

import math

from osml.metrics import ndcg_at_k, popularity_baseline, random_baseline, recall_at_k

# User A holds out {1, 4} and gets them at ranks 2 and 4.
#   DCG@10 = 1/log2(3) + 1/log2(5)      = 0.630930 + 0.430677 = 1.061606
#   IDCG@10 = 1/log2(2) + 1/log2(3)     = 1.000000 + 0.630930 = 1.630930
#   nDCG@10 = 1.061606 / 1.630930       = 0.650921
#   recall@20: both held-out items are in the list -> 2/2 = 1.0
USER_A = ([3, 1, 7, 4, 0, 2, 5, 6, 8, 9], {1, 4}, 0.6509209298, 1.0)

# User B holds out {2, 5} and gets one of them, at rank 3. Item 5 is not in
# the list at all.
#   DCG@10 = 1/log2(4)                  = 0.500000
#   IDCG@10 = 1.000000 + 0.630930        = 1.630930
#   nDCG@10 = 0.500000 / 1.630930       = 0.306574
#   recall@20: one held-out item of two -> 1/2 = 0.5
USER_B = ([0, 1, 2, 3, 4, 6, 7, 8, 9, 10], {2, 5}, 0.3065735964, 0.5)

# User C holds out {7} and never gets it.
#   DCG@10 = 0, IDCG@10 = 1/log2(2) = 1.000000 -> nDCG@10 = 0.0
#   recall@20: nothing of it -> 0/1 = 0.0
USER_C = ([0, 1, 2, 3, 4, 5, 6, 8, 9, 10], {7}, 0.0, 0.0)

USERS = (USER_A, USER_B, USER_C)


def test_the_ndcg_of_the_three_users():
    for ranked, relevant, expected, _ in USERS:
        assert math.isclose(ndcg_at_k(ranked, relevant, 10), expected, rel_tol=1e-9)


def test_the_recall_of_the_three_users():
    for ranked, relevant, _, expected in USERS:
        assert math.isclose(recall_at_k(ranked, relevant, 20), expected, rel_tol=1e-9)


def test_the_means_of_the_three_users():
    ndcg = sum(ndcg_at_k(ranked, relevant, 10) for ranked, relevant, _, _ in USERS) / 3
    recall = sum(recall_at_k(ranked, relevant, 20) for ranked, relevant, _, _ in USERS) / 3

    assert math.isclose(ndcg, (USER_A[2] + USER_B[2] + USER_C[2]) / 3, rel_tol=1e-9)
    assert math.isclose(recall, (USER_A[3] + USER_B[3] + USER_C[3]) / 3, rel_tol=1e-9)


def test_a_user_without_relevant_items_scores_nothing():
    assert ndcg_at_k([1, 2, 3], set(), 10) == 0.0
    assert recall_at_k([1, 2, 3], set(), 20) == 0.0


def test_the_baselines_leave_out_the_items_the_user_has_seen():
    from scipy.sparse import csr_matrix

    matrix = csr_matrix(
        ([1.0, 1.0, 1.0, 1.0], ([0, 0, 1, 1], [0, 1, 2, 3])),
        shape=(2, 4),
    )

    popular = popularity_baseline(matrix, n=2)
    assert popular[0] == [2, 3]  # items 0 and 1 are seen
    assert popular[1] == [0, 1]

    random_lists = random_baseline(matrix, n=2, seed=42)
    assert len(random_lists) == 2
    assert set(random_lists[0]).isdisjoint({0, 1})
    assert set(random_lists[1]).isdisjoint({2, 3})

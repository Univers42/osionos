"""The promotion rule: the candidate replaces the champion only when it is
not worse.

The two numbers the rule compares are the twins' scores on the SAME holdout:
the candidate's twin and the champion's twin, each refitted on the same
training events. A champion that does not exist yet is nothing to compare
with, so the first candidate is promoted.
"""

from osml.job import _promotable


def test_without_a_champion_the_candidate_is_promoted():
    assert _promotable(None, 0.0) is True
    assert _promotable(None, 0.5) is True


def test_an_equal_score_is_promoted():
    assert _promotable(0.42, 0.42) is True


def test_a_lower_score_is_not_promoted():
    assert _promotable(0.42, 0.41) is False

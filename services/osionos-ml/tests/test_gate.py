"""The gate: the model beats the popularity baseline, and the interval says so."""

from osml.evaluate import evaluate


def test_ials_beats_popularity_and_the_interval_stays_above_zero():
    report = evaluate()

    assert report["metrics"]["ials"]["ndcg@10"] > report["metrics"]["popularity"]["ndcg@10"]
    assert report["difference_ials_minus_popularity"]["ci95_low"] > 0.0

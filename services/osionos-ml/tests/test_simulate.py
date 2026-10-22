"""The synthetic log: the same seed gives the same log, and the log is labelled."""

from collections import Counter

from osml.simulate import simulate


def test_the_same_seed_gives_the_same_events():
    first = simulate(50, 100, 5, 500, seed=42)
    second = simulate(50, 100, 5, 500, seed=42)

    assert first == second


def test_another_seed_gives_another_log():
    first = simulate(50, 100, 5, 500, seed=42)
    other = simulate(50, 100, 5, 500, seed=43)

    assert first != other


def test_every_row_is_labelled_synthetic():
    log = simulate(50, 100, 5, 500, seed=42)

    assert len(log) == 500
    assert all(row["is_synthetic"] is True for row in log)


def test_the_rows_carry_the_ais_events_columns():
    log = simulate(50, 100, 5, 500, seed=42)
    row = log[0]

    assert set(row) == {"user_id", "item_kind", "item_id", "event", "ts", "is_synthetic"}
    assert isinstance(row["ts"], int)


def test_the_popularity_is_skewed():
    log = simulate(200, 1000, 10, 20000, seed=42)
    counts = Counter(row["item_id"] for row in log)

    top = sorted(counts.values(), reverse=True)[:100]
    share = sum(top) / len(log)

    assert share > 0.40


def test_the_events_spread_over_the_ninety_days():
    log = simulate(200, 1000, 10, 20000, seed=42)
    stamps = [row["ts"] for row in log]

    assert max(stamps) - min(stamps) > 60 * 86400

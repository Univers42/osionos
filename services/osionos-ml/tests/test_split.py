"""The time split: the test set is always later than the training set."""

from collections import defaultdict

from osml.simulate import simulate
from osml.split import split_events


def test_no_test_event_is_earlier_than_a_train_event_of_the_same_user():
    log = simulate(200, 500, 10, 8000, seed=42)
    train, valid, test = split_events(log)

    last_train: dict[str, int] = defaultdict(lambda: -1)
    first_test: dict[str, int] = {}
    for event in train:
        last_train[event["user_id"]] = max(last_train[event["user_id"]], event["ts"])
    for event in test:
        first_test.setdefault(event["user_id"], event["ts"])

    for user, stamp in first_test.items():
        assert last_train[user] <= stamp


def test_a_user_with_fewer_than_five_events_has_no_test_row():
    log = simulate(200, 500, 10, 8000, seed=42)
    train, valid, test = split_events(log)

    counts = defaultdict(int)
    for event in log:
        counts[event["user_id"]] += 1
    tested = {event["user_id"] for event in test}

    for user, count in counts.items():
        if count < 5:
            assert user not in tested


def test_a_short_user_stays_train_only():
    log = [
        {"user_id": "u1", "item_kind": "page", "item_id": "i1", "event": "like", "ts": 1},
        {"user_id": "u1", "item_kind": "page", "item_id": "i2", "event": "like", "ts": 2},
        {"user_id": "u1", "item_kind": "page", "item_id": "i3", "event": "like", "ts": 3},
        {"user_id": "u1", "item_kind": "page", "item_id": "i4", "event": "like", "ts": 4},
    ]
    train, valid, test = split_events(log)

    assert len(train) == 4
    assert valid == []
    assert test == []


def test_the_split_holds_out_the_last_fifth_of_every_user():
    log = simulate(200, 500, 10, 8000, seed=42)
    train, valid, test = split_events(log)

    totals = defaultdict(int)
    for event in log:
        totals[event["user_id"]] += 1
    held_out = defaultdict(int)
    for event in test:
        held_out[event["user_id"]] += 1

    for user, count in totals.items():
        if count < 5:
            continue
        assert held_out[user] == max(1, -(-count * 20 // 100))


def test_the_validation_split_is_cut_out_of_the_training_part():
    log = simulate(200, 500, 10, 8000, seed=42)
    train, valid, test = split_events(log)

    assert valid
    assert set(id(row) for row in valid).isdisjoint(id(row) for row in train)
    assert set(id(row) for row in valid).isdisjoint(id(row) for row in test)


def test_every_event_lands_in_exactly_one_part():
    log = simulate(100, 300, 5, 3000, seed=42)
    train, valid, test = split_events(log)

    assert len(train) + len(valid) + len(test) == len(log)

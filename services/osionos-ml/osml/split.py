"""A per-user TIME split of the log.

Every user's events are sorted by time. The last 20% of them (at least one)
is the TEST set. A user with fewer than 5 events stays train-only: too short
a history to hold out anything.

The VALIDATION split is cut the same way out of the training part. It is for
tuning ONLY — the test set is never looked at while choosing a model.
"""

import math
from collections.abc import Iterable, Mapping
from typing import Any

# A user with fewer events than this stays train-only.
MIN_EVENTS = 5
# The share of a user's events that is held out.
TEST_FRACTION = 0.2
VALID_FRACTION = 0.2


def split_events(
    events: Iterable[Mapping[str, Any]],
    test_fraction: float = TEST_FRACTION,
    valid_fraction: float = VALID_FRACTION,
    min_events: int = MIN_EVENTS,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """The (train, validation, test) events, split per user, by time.

    Within one user the split never goes backwards: no test event is earlier
    than a train event of the same user.
    """
    by_user: dict[str, list[tuple[int, int, dict[str, Any]]]] = {}
    for order, event in enumerate(events):
        by_user.setdefault(str(event["user_id"]), []).append((int(event["ts"]), order, dict(event)))

    train: list[dict[str, Any]] = []
    valid: list[dict[str, Any]] = []
    test: list[dict[str, Any]] = []

    for user_events in by_user.values():
        user_events.sort(key=lambda triple: (triple[0], triple[1]))
        rows = [triple[2] for triple in user_events]
        count = len(rows)
        if count < min_events:
            train.extend(rows)
            continue

        held_out = max(1, math.ceil(count * test_fraction))
        tuned = max(1, math.ceil((count - held_out) * valid_fraction))
        cut = count - held_out - tuned

        train.extend(rows[:cut])
        valid.extend(rows[cut : count - held_out])
        test.extend(rows[count - held_out :])

    return train, valid, test


def ground_truth(
    events: Iterable[Mapping[str, Any]],
    user_index: Mapping[str, int],
    item_index: Mapping[str, int],
) -> dict[int, set[int]]:
    """The held-out items of every user: user row -> the items to predict."""
    truth: dict[int, set[int]] = {}
    for event in events:
        row = user_index.get(str(event["user_id"]))
        column = item_index.get(str(event["item_id"]))
        if row is None or column is None:
            continue
        truth.setdefault(row, set()).add(column)
    return truth

"""The event log's weights, in ONE place.

The `ai_events` log is a table of (user_id, item_kind, item_id, event, ts).
This module holds the weight of every event kind and turns the log's rows
into the weighted user x item matrix the model trains on.

A share says more than a click; a click says more than a view.
`not_interested` is a NEGATIVE: it never enters the matrix — it is used only
to filter what serving shows.
"""

from collections.abc import Iterable, Mapping
from typing import Any

import numpy as np
from scipy.sparse import csr_matrix

# The weight of one event kind.
EVENT_WEIGHTS: dict[str, float] = {
    "like": 1.0,
    "react": 1.0,
    "comment": 2.0,
    "share": 3.0,
    "favorite": 2.0,
    "connect": 1.0,
    "view": 0.25,
    "click": 0.5,
}

# The negatives: excluded from training, kept to filter serving.
EXCLUDED_EVENTS: frozenset[str] = frozenset({"not_interested"})


def event_weight(event: str) -> float:
    """The weight of one event kind. 0.0 for a negative or an unknown kind."""
    return EVENT_WEIGHTS.get(event, 0.0)


def index_users(events: Iterable[Mapping[str, Any]]) -> dict[str, int]:
    """The log's users, in first-seen order: user_id -> row of the matrix."""
    index: dict[str, int] = {}
    for event in events:
        index.setdefault(str(event["user_id"]), len(index))
    return index


def index_items(events: Iterable[Mapping[str, Any]]) -> dict[str, int]:
    """The log's items, in first-seen order: item_id -> column of the matrix.

    Items are keyed by `item_id` alone. A log that mixes kinds with colliding
    ids must namespace them itself (`"page:42"`), because the matrix is a
    single catalogue of columns.
    """
    index: dict[str, int] = {}
    for event in events:
        index.setdefault(str(event["item_id"]), len(index))
    return index


def build_matrix(
    events: Iterable[Mapping[str, Any]],
    user_index: Mapping[str, int],
    item_index: Mapping[str, int],
) -> csr_matrix:
    """The user x item matrix of summed event weights.

    Rows are users, columns are items. Two events of the same user on the
    same item SUM: a like and a share on one item is one weight of 4.0, not
    two items.

    A row whose user or item is not in the index is ignored (the catalogue
    moves on without it), and so is a negative: `not_interested` never enters
    the matrix.
    """
    rows: list[int] = []
    columns: list[int] = []
    values: list[float] = []
    for event in events:
        weight = event_weight(str(event["event"]))
        if weight <= 0.0:
            continue
        row = user_index.get(str(event["user_id"]))
        column = item_index.get(str(event["item_id"]))
        if row is None or column is None:
            continue
        rows.append(row)
        columns.append(column)
        values.append(weight)

    if not values:
        return csr_matrix((len(user_index), len(item_index)), dtype=np.float64)

    # csr_matrix sums the duplicate (row, column) pairs it is handed.
    return csr_matrix((values, (rows, columns)), shape=(len(user_index), len(item_index)), dtype=np.float64)

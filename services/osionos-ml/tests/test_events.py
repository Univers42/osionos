"""The event weights, and the matrix they build."""

from osml.events import EVENT_WEIGHTS, build_matrix, event_weight, index_items, index_users


def test_the_weights_are_the_ones_the_log_gets():
    assert EVENT_WEIGHTS == {
        "like": 1.0,
        "react": 1.0,
        "comment": 2.0,
        "share": 3.0,
        "favorite": 2.0,
        "connect": 1.0,
        "view": 0.25,
        "click": 0.5,
    }


def test_two_events_of_one_user_on_one_item_sum():
    events = [
        {"user_id": "u1", "item_kind": "page", "item_id": "i1", "event": "like", "ts": 1},
        {"user_id": "u1", "item_kind": "page", "item_id": "i1", "event": "comment", "ts": 2},
        {"user_id": "u1", "item_kind": "page", "item_id": "i2", "event": "share", "ts": 3},
        {"user_id": "u2", "item_kind": "page", "item_id": "i1", "event": "view", "ts": 4},
    ]
    users = index_users(events)
    items = index_items(events)
    matrix = build_matrix(events, users, items)

    assert matrix.shape == (2, 2)
    assert matrix[0, 0] == 3.0  # like 1.0 + comment 2.0
    assert matrix[0, 1] == 3.0  # share
    assert matrix[1, 0] == 0.25  # view
    assert matrix[1, 1] == 0.0


def test_not_interested_never_enters_the_matrix():
    events = [
        {"user_id": "u1", "item_kind": "page", "item_id": "i1", "event": "not_interested", "ts": 1},
        {"user_id": "u1", "item_kind": "page", "item_id": "i2", "event": "not_interested", "ts": 2},
    ]
    users = index_users(events)
    items = index_items(events)
    matrix = build_matrix(events, users, items)

    assert matrix.nnz == 0
    assert event_weight("not_interested") == 0.0


def test_a_negative_next_to_a_positive_leaves_only_the_positive():
    events = [
        {"user_id": "u1", "item_kind": "page", "item_id": "i1", "event": "not_interested", "ts": 1},
        {"user_id": "u1", "item_kind": "page", "item_id": "i1", "event": "like", "ts": 2},
    ]
    users = index_users(events)
    items = index_items(events)
    matrix = build_matrix(events, users, items)

    assert matrix[0, 0] == 1.0


def test_an_unknown_user_or_item_is_left_out():
    known = [{"user_id": "u1", "item_kind": "page", "item_id": "i1", "event": "like", "ts": 1}]
    events = known + [
        {"user_id": "ghost", "item_kind": "page", "item_id": "i1", "event": "like", "ts": 2},
        {"user_id": "u1", "item_kind": "page", "item_id": "ghost", "event": "like", "ts": 3},
    ]
    users = index_users(known)
    items = index_items(known)
    matrix = build_matrix(events, users, items)

    assert matrix.nnz == 1
    assert matrix[0, 0] == 1.0

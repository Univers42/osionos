"""Write the fold-in PARITY FIXTURE: the numbers Python and Node must share.

The fixture is the contract between the numpy reference (`osml.foldin`, the
model's user step) and the bridge that serves it (`scripts/bridge-recs-model.mjs`,
the fold-in of a user at request time). It holds a small model, three users
and the vector each of them folds in to; the Node test reads it and checks its
own numbers against it, and the Python test recomputes the vectors from the
same inputs and checks them against it too.

DETERMINISTIC: the seed is 7, the generator is numpy's, and the users are
written by hand — so the file is the same on every machine, and a change in it
is a change in the contract, not in the noise.

Usage:  python scripts/write_foldin_fixture.py
"""

import json
import sys
from pathlib import Path

import numpy as np

SERVICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE))

from osml.events import EVENT_WEIGHTS  # noqa: E402
from osml.foldin import fold_in  # noqa: E402

SEED = 7
ITEMS = 12
FACTORS = 8
REGULARIZATION = 0.05
ALPHA = 40.0
FIXTURE = SERVICE / "tests" / "fixtures" / "foldin-parity.json"

ITEM_IDS = [f"{index:08x}-0000-4000-8000-000000000000" for index in range(1, ITEMS + 1)]

# Three users, and what each of them touched. The events are the names the log
# holds, with their COUNTS: the weights live in ONE place (osml.events) and
# the fixture only says what happened.
USERS = [
    {
        "user_id": "11111111-1111-4111-8111-111111111111",
        "items": [
            {"item_id": ITEM_IDS[0], "events": {"like": 2}},
            {"item_id": ITEM_IDS[3], "events": {"comment": 1, "like": 1}},
            {"item_id": ITEM_IDS[7], "events": {"share": 1}},
        ],
    },
    {
        "user_id": "22222222-2222-4222-8222-222222222222",
        "items": [
            {"item_id": ITEM_IDS[1], "events": {"favorite": 1}},
            {"item_id": ITEM_IDS[2], "events": {"react": 3}},
            {"item_id": ITEM_IDS[9], "events": {"comment": 2}},
        ],
    },
    {
        "user_id": "33333333-3333-4333-8333-333333333333",
        "items": [
            {"item_id": ITEM_IDS[4], "events": {"like": 1, "react": 1}},
            {"item_id": ITEM_IDS[5], "events": {"share": 2}},
            {"item_id": ITEM_IDS[10], "events": {"comment": 1, "favorite": 1}},
            {"item_id": ITEM_IDS[11], "events": {"like": 1}},
        ],
    },
]


def item_weights(user: dict) -> list[float]:
    """The weight of each item of a user: the sum of count × weight over its events."""
    weights = []
    for entry in user["items"]:
        total = 0.0
        for event, count in entry["events"].items():
            if event not in EVENT_WEIGHTS:
                raise ValueError(f"{event} is not an event of the log")
            total += count * EVENT_WEIGHTS[event]
        weights.append(total)
    return weights


def main() -> None:
    """The model, the gram, the three vectors: written as one JSON file."""
    generator = np.random.default_rng(SEED)
    factors = generator.normal(size=(ITEMS, FACTORS))
    index_of = {item_id: index for index, item_id in enumerate(ITEM_IDS)}
    expected = {}
    for user in USERS:
        indices = [index_of[entry["item_id"]] for entry in user["items"]]
        vector = fold_in(factors, indices, item_weights(user), REGULARIZATION, ALPHA)
        expected[user["user_id"]] = [float(value) for value in vector]
    payload = {
        "seed": SEED,
        "factors": FACTORS,
        "regularization": REGULARIZATION,
        "alpha": ALPHA,
        "event_weights": dict(EVENT_WEIGHTS),
        # The gram the way the champion's row holds it: row-major, factors² numbers.
        "item_gram": [float(value) for value in (factors.T @ factors).flatten()],
        "items": [
            {"item_id": ITEM_IDS[index], "vector": [float(value) for value in factors[index]]} for index in range(ITEMS)
        ],
        "users": USERS,
        "expected": expected,
    }
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"[foldin-fixture] {FIXTURE} written ({ITEMS} items, {FACTORS} factors, {len(USERS)} users)")


if __name__ == "__main__":
    main()

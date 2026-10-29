"""The fold-in PARITY FIXTURE: the numbers the bridge and numpy must share.

The fixture (tests/fixtures/foldin-parity.json) holds a small model, three
users and the vector each of them folds in to. This test recomputes every one
of those vectors from the fixture's OWN inputs — the item factors, the events
and the weights — and compares it with what the fixture says. If the fixture
and the reference ever disagree, the bridge would be folding in differently
from the model that trained: the test says so here, before a slate is served.
"""

import json
from pathlib import Path

import numpy as np

from osml.events import EVENT_WEIGHTS
from osml.foldin import fold_in

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "foldin-parity.json"


def load_fixture() -> dict:
    """The fixture, as Python sees it."""
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_every_expected_vector_is_the_reference_fold_in():
    """Each user's vector is what the reference computes from the same inputs."""
    fixture = load_fixture()
    factors = np.asarray([item["vector"] for item in fixture["items"]], dtype=np.float64)
    index_of = {item["item_id"]: index for index, item in enumerate(fixture["items"])}
    for user in fixture["users"]:
        indices = [index_of[entry["item_id"]] for entry in user["items"]]
        weights = [
            sum(count * EVENT_WEIGHTS[event] for event, count in entry["events"].items()) for entry in user["items"]
        ]
        vector = fold_in(factors, indices, weights, fixture["regularization"], fixture["alpha"])
        expected = np.asarray(fixture["expected"][user["user_id"]], dtype=np.float64)
        assert np.allclose(vector, expected, atol=1e-9, rtol=0.0)


def test_the_gram_is_the_model_own():
    """The fixture's gram is YᵀY of the items it holds — the champion's own."""
    fixture = load_fixture()
    factors = np.asarray([item["vector"] for item in fixture["items"]], dtype=np.float64)
    gram = np.asarray(fixture["item_gram"], dtype=np.float64).reshape(fixture["factors"], fixture["factors"])
    assert np.allclose(gram, factors.T @ factors, atol=1e-12, rtol=0.0)


def test_the_weights_are_the_log_own():
    """The fixture weighs the events with the weights of ONE place: osml.events."""
    fixture = load_fixture()
    assert fixture["event_weights"] == EVENT_WEIGHTS

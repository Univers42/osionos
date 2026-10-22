"""A SYNTHETIC event log, labelled on every row.

Real users are few, so the offline evaluation runs on a simulated log. Every
row this module produces carries `is_synthetic: True`, and every number the
evaluation reports is a number about the SIMULATION, not about osionos.

The shape of the simulation:

  * each item has ONE topic and a Zipf popularity (s = 1.1) — a few items
    carry most of the traffic;
  * each user has a Dirichlet (alpha = 0.3) topic mixture — a user has a few
    strong interests, not a flat taste;
  * an event picks a topic from the user's mixture, then an item of that
    topic weighted by popularity, then an event kind;
  * timestamps spread over 90 days.
"""

from typing import Any

import numpy as np

# The exponent of the items' popularity (Zipf-Mandelbrot).
ZIPF_S = 1.1
# The concentration of every user's topic mixture (Dirichlet).
DIRICHLET_ALPHA = 0.3
# How far the log spreads in time.
DAYS = 90
# 2026-01-01T00:00:00Z, the first second of the simulated log.
START_TS = 1767225600
# What the simulated items are: pages of the feed.
ITEM_KIND = "page"

# The kinds of event the simulation produces, and how often.
EVENT_MIX: tuple[tuple[str, float], ...] = (
    ("like", 0.50),
    ("react", 0.15),
    ("comment", 0.15),
    ("favorite", 0.10),
    ("share", 0.10),
)


def simulate(n_users: int, n_items: int, n_topics: int, n_events: int, seed: int) -> list[dict[str, Any]]:
    """A synthetic log of `n_events` events over `n_users` users and `n_items` items.

    Deterministic for a seed: the same seed gives the same log, event for
    event and timestamp for timestamp.
    """
    rng = np.random.default_rng(seed)

    # The items' popularity: item 0 is the most popular of all.
    popularity = 1.0 / np.power(np.arange(1, n_items + 1), ZIPF_S)
    # Every item has one topic; the topics are spread evenly over the items.
    topic_of_item = np.arange(n_items) % n_topics
    items_of_topic = [np.flatnonzero(topic_of_item == topic) for topic in range(n_topics)]
    cumulative_of_topic = [np.cumsum(popularity[items]) for items in items_of_topic]

    # Every user's topic mixture, and its cumulative form for the sampling.
    mixtures = rng.dirichlet(np.full(n_topics, DIRICHLET_ALPHA), size=n_users)
    cumulative_mixtures = np.cumsum(mixtures, axis=1)

    users = rng.integers(0, n_users, n_events)
    draws = rng.random(n_events)
    topics = (cumulative_mixtures[users] < draws[:, None]).sum(axis=1)

    # The item of every event: an item of the topic, weighted by popularity.
    items = np.empty(n_events, dtype=np.int64)
    for topic in range(n_topics):
        mask = topics == topic
        count = int(mask.sum())
        if count == 0:
            continue
        cumulative = cumulative_of_topic[topic]
        picks = np.searchsorted(cumulative, rng.random(count) * cumulative[-1])
        items[mask] = items_of_topic[topic][np.minimum(picks, len(cumulative) - 1)]

    # The kind of every event.
    kind_names = [name for name, _ in EVENT_MIX]
    cumulative_kinds = np.cumsum([share for _, share in EVENT_MIX])
    kind_draws = rng.random(n_events)
    kind_indices = np.searchsorted(cumulative_kinds, kind_draws)
    kind_indices = np.minimum(kind_indices, len(kind_names) - 1)

    # When every event happened.
    timestamps = START_TS + rng.integers(0, DAYS * 86400, n_events)

    return [
        {
            "user_id": f"u{users[position]}",
            "item_kind": ITEM_KIND,
            "item_id": f"i{items[position]}",
            "event": kind_names[kind_indices[position]],
            "ts": int(timestamps[position]),
            "is_synthetic": True,
        }
        for position in range(n_events)
    ]

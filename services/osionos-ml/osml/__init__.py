"""osml — the recommender's model for osionos (M3c-1).

Implicit-feedback ALS (Hu, Koren, Volinsky 2008; Rendle et al. 2021) over the
`ai_events` log. This slice is the MODEL and its OFFLINE MEASUREMENT only:
there is no database, no route and no serving here.

Everything the evaluation measures runs on a SYNTHETIC log (see `osml.simulate`):
real users are too few for an offline number to mean anything yet.
"""

__version__ = "0.1.0"

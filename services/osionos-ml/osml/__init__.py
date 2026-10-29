"""osml — the recommender's model for osionos (M3c-1) and its training job (M3c-3).

Implicit-feedback ALS (Hu, Koren, Volinsky 2008; Rendle et al. 2021) over the
`ai_events` log. This slice holds the MODEL, its OFFLINE MEASUREMENT, and the
JOB that trains the model from the log and writes it to the registry. There is
no route and no serving here.

The offline measurement runs on a SYNTHETIC log (see `osml.simulate`): real
users are too few for an offline number to mean anything yet.
"""

__version__ = "0.1.0"

"""The database half of the training job: the log in, the model out.

M3c-2 (groot) gave the model a home in Postgres: the registry `ai_rec_models`
(ONE champion), the zero-padded factor vectors, `ai_rec_promote` and
`ai_rec_prune`. This module is the half of the job that talks to that home:
it reads the `ai_events` log and writes the model. The maths is in
`osml.train`, the metrics in `osml.metrics`, the protocol in `osml.job`.
"""

import json
import os
import re
from collections.abc import Sequence
from datetime import datetime
from typing import Any

import psycopg

from .events import EXCLUDED_EVENTS

# The dimension every stored vector has: the registry's column is vector(64)
# and a model with fewer factors is stored zero-padded. The padding changes
# no score — an inner product sums coordinate products, and a real
# coordinate times a zero is zero.
FACTOR_DIM = 64

# The shape of the code sha the job stamps on the models it writes: the
# registry's own CHECK is the same pattern.
CODE_SHA = re.compile(r"^[0-9a-f]{7,64}$")


def act_as_service_role(conn: psycopg.Connection) -> None:
    """Run the session as service_role, the way PostgREST does (SET ROLE).

    COPY FROM is refused on a table with row-level security unless the CURRENT
    role bypasses it, and BYPASSRLS is an attribute of service_role that a
    member does not inherit. SET ROLE makes the login role need nothing but the
    membership, and drops a superuser login to service_role's privileges.
    """
    member = conn.execute(
        "SELECT pg_has_role(session_user, 'service_role', 'MEMBER') AND current_user <> 'service_role'"
    ).fetchone()
    if member and member[0]:
        conn.execute("SET ROLE service_role")


def pad64(vector: Sequence[float]) -> list[float]:
    """The vector, padded with zeros to the dimension the registry stores. A
    16-factor model is stored as a 64-dimensional vector whose last 48
    numbers are zero. A vector with MORE than 64 numbers does not fit: it
    raises, because a truncated vector would score something else."""
    values = [float(value) for value in vector]
    if len(values) > FACTOR_DIM:
        raise ValueError(f"a vector of {len(values)} numbers does not fit in {FACTOR_DIM}")
    return values + [0.0] * (FACTOR_DIM - len(values))


def code_sha() -> str | None:
    """The code sha of the running image, when it looks like one."""
    sha = os.environ.get("OSML_CODE_SHA", "").strip()
    return sha if CODE_SHA.match(sha) else None


def read_events(
    conn: psycopg.Connection,
    since: datetime,
    until: datetime,
    synthetic: bool,
) -> list[dict[str, Any]]:
    """The log's rows in [since, until), for the job to train on.

    A model is trained on the REAL events or on the SYNTHETIC ones, never on
    a mix: `is_synthetic` is a filter here, not a weight. A user who opted
    out — `ai_personalization_settings.capture_explicit` is false — is out of
    the log: their past events do not train the model. The items are keyed
    `f"{item_kind}:{item_id}"`: the matrix is one catalogue of columns, and a
    page and a user can carry the same id.
    """
    sql = """
        SELECT e.ts, e.user_id::text, e.item_kind, e.item_id::text,
               e.workspace_id::text, e.event
          FROM public.ai_events e
         WHERE e.ts >= %s AND e.ts < %s AND e.is_synthetic = %s
           AND e.event <> ALL(%s::text[])
           AND NOT EXISTS (SELECT 1 FROM public.ai_personalization_settings s
                            WHERE s.user_id = e.user_id AND s.capture_explicit = false)
         ORDER BY e.ts, e.id
    """
    with conn.cursor() as cur:
        cur.execute(sql, (since, until, synthetic, sorted(EXCLUDED_EVENTS)))
        rows = cur.fetchall()
    return [
        {
            "ts": ts,
            "user_id": user_id,
            "item_kind": kind,
            "item_id": f"{kind}:{item_id}",
            "item_uuid": item_id,
            "workspace_id": workspace_id,
            "event": event,
        }
        for ts, user_id, kind, item_id, workspace_id, event in rows
    ]


def champion(conn: psycopg.Connection) -> dict[str, Any] | None:
    """The champion row, or None when there is no champion yet."""
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM public.ai_rec_models WHERE status = 'champion'")
        row = cur.fetchone()
        if row is None:
            return None
        return {column.name: value for column, value in zip(cur.description, row, strict=True)}


def write_model(
    conn: psycopg.Connection,
    params: dict[str, Any],
    metrics: dict[str, Any],
    users: Sequence[str],
    items: Sequence[tuple[str, str, Any]],
    user_factors: Sequence[Sequence[float]],
    item_factors: Sequence[Sequence[float]],
    synthetic: bool,
    trained_until: datetime,
) -> int:
    """The new model: the registry row and its factors, in ONE transaction.

    `params` holds the model row's hyperparameters (algo, factors,
    regularization, alpha, iterations, events_used), `users` the user ids in
    the matrix's row order, `items` the items in its column order as
    (`item_kind`, `item_id`, `workspace_id`) tuples, and the two factor lists
    the vectors, in the same order. The row starts as a `candidate`: the job
    promotes it only when it is not worse.
    """
    # One transaction: a failed write takes the row and the factors with it.
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.ai_rec_models
                    (algo, factors, regularization, alpha, iterations, events_used, trained_until,
                     metrics, is_synthetic, code_sha, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, 'candidate')
                RETURNING id
                """,
                (
                    params["algo"],
                    params["factors"],
                    params["regularization"],
                    params["alpha"],
                    params["iterations"],
                    params["events_used"],
                    trained_until,
                    json.dumps(metrics, default=_iso),
                    synthetic,
                    code_sha(),
                ),
            )
            model_id = int(cur.fetchone()[0])
        _copy(
            conn,
            "COPY public.ai_rec_item_factors (model_id, item_kind, item_id, workspace_id, factors) FROM STDIN",
            [
                (model_id, kind, item_id, workspace, _literal(pad64(vector)))
                for (kind, item_id, workspace), vector in zip(items, item_factors, strict=True)
            ],
        )
        _copy(
            conn,
            "COPY public.ai_rec_user_factors (model_id, user_id, factors) FROM STDIN",
            [(model_id, user, _literal(pad64(vector))) for user, vector in zip(users, user_factors, strict=True)],
        )
    return model_id


def promote(conn: psycopg.Connection, model_id: int) -> str:
    """The promotion: the candidate becomes the champion, the old one retires.

    `p_force` is true, and the job's own comparison is the fair one: the
    database would compare the candidate with the champion's OLD holdout, and
    the job has already compared the two on the SAME split.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT public.ai_rec_promote(%s, true)", (model_id,))
        return str(cur.fetchone()[0])


def prune(conn: psycopg.Connection) -> int:
    """The prune: the retired models beyond the newest two, and the stale
    candidates (older than 7 days), go. The champion is never pruned."""
    with conn.cursor() as cur:
        cur.execute("SELECT public.ai_rec_prune()")
        return int(cur.fetchone()[0])


def _copy(conn: psycopg.Connection, statement: str, rows: list[tuple[Any, ...]]) -> None:
    """The COPY of the factor rows. The vectors go in as their text form."""
    with conn.cursor() as cur:
        with cur.copy(statement) as copy:
            for row in rows:
                copy.write_row(row)


def _literal(vector: Sequence[float]) -> str:
    """The vector as pgvector's text form: [0.1,0.2,0]. Nine significant
    digits are what a float32 round-trips through, and the column is a float4."""
    return "[" + ",".join(f"{value:.9g}" for value in vector) + "]"


def _iso(value: Any) -> str:
    """The JSON form of what `json.dumps` does not know: a timestamp."""
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"a {type(value).__name__} is not JSON")

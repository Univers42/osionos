"""The job against a real database: the log in, a candidate out.

The tests need a database with the groot fixture applied (the roles, the
events migration, the factors migration) and a DATABASE_URL for a role that
has service_role's grants and nothing more. `scripts/test-db.sh` builds one.

The log is a `simulate.py` one — SYNTHETIC, marked `is_synthetic = true` —
spread over 60 days, with one user who opted out. The job is run three times
on it: the first run promotes its model, the second promotes its own (the
scores are equal, and equal is not worse), and the third runs with worse
hyperparameters and stays a candidate.
"""

import json
import os
import re
import subprocess
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import psycopg
import pytest

from osml.events import build_matrix, event_weight, index_items, index_users
from osml.simulate import simulate
from osml.store import read_events
from osml.train import train_ials

pytestmark = pytest.mark.db

# The service's own directory: the job runs from there.
SERVICE = Path(__file__).resolve().parents[1]

# The log's shape: 60 users, 120 items, 4 000 events over 60 days.
USERS = 60
ITEMS = 120
TOPICS = 12
EVENT_COUNT = 4000
DAYS = 60
SEED = 42

# The namespace the test's uuids come from: the same names on every run.
NAMESPACE = uuid.UUID("6f6b1c2a-0000-4000-8000-000000000001")
# The user who opted out: their events must not train the model.
OPTOUT = "u0"

# The uuid of a name: stable, so a rerun finds the same rows.
IDENTITY = uuid.uuid5


def _uuid(kind: str, name: str) -> str:
    """The uuid of a name: the same log on every run."""
    return str(IDENTITY(NAMESPACE, f"{kind}/{name}"))


def _rows(cur: psycopg.Cursor) -> list[dict[str, Any]]:
    """The rows of a query, as dictionaries."""
    names = [column.name for column in cur.description]
    return [dict(zip(names, row, strict=True)) for row in cur.fetchall()]


def _count(conn: psycopg.Connection, table: str) -> int:
    """The number of rows of a table of the registry."""
    assert table in ("ai_rec_models", "ai_rec_item_factors", "ai_rec_user_factors")
    with conn.cursor() as cur:
        cur.execute(f"SELECT count(*) FROM public.{table}")
        return int(cur.fetchone()[0])


def _models(conn: psycopg.Connection) -> list[dict[str, Any]]:
    """The registry's rows, oldest first."""
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM public.ai_rec_models ORDER BY id")
        return _rows(cur)


def _run(until: datetime, extra: list[str] | None = None, env: dict[str, str] | None = None) -> dict[str, Any]:
    """The job, as a subprocess: its exit code, its stdout, its log line."""
    command = [
        sys.executable,
        "-m",
        "osml.job",
        "--until",
        until.isoformat(),
        "--window-days",
        "180",
        "--holdout-days",
        "7",
        *(extra or []),
    ]
    environment = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1", **(env or {})}
    done = subprocess.run(command, cwd=SERVICE, capture_output=True, text=True, env=environment, check=False)
    lines = [line for line in done.stdout.splitlines() if line.strip()]
    return {
        "returncode": done.returncode,
        "stdout": done.stdout,
        "stderr": done.stderr,
        "log": json.loads(lines[-1]) if lines else {},
    }


@pytest.fixture(scope="module")
def conn() -> Any:
    """The database, as the job's own role: service_role's grants, no more."""
    dsn = os.environ.get("DATABASE_URL", "").strip()
    if not dsn:
        pytest.skip("DATABASE_URL is not set")
    with psycopg.connect(dsn, autocommit=True) as connection:
        yield connection


@pytest.fixture(scope="module")
def until() -> datetime:
    """The end of the window: now, to the second."""
    return datetime.now(UTC).replace(microsecond=0)


@pytest.fixture(scope="module")
def seeded(conn: psycopg.Connection, until: datetime) -> dict[str, Any]:
    """The log: a simulated one over 60 days, with one user opted out."""
    log = simulate(USERS, ITEMS, TOPICS, EVENT_COUNT, SEED)
    base = min(int(event["ts"]) for event in log)
    span = max(int(event["ts"]) for event in log) - base
    rows = []
    for event in log:
        offset = int((int(event["ts"]) - base) * (DAYS * 86400 - 1) / span)
        rows.append(
            (
                until - timedelta(seconds=DAYS * 86400 - offset),
                _uuid("user", str(event["user_id"])),
                str(event["item_kind"]),
                _uuid("item", str(event["item_id"])),
                _uuid("workspace", str(event["item_id"])),
                str(event["event"]),
            )
        )
    with conn.cursor() as cur:
        cur.execute("DELETE FROM public.ai_events")
        cur.execute("DELETE FROM public.ai_personalization_settings")
        with cur.copy(
            "COPY public.ai_events (ts, user_id, item_kind, item_id, workspace_id, event, weight, surface, "
            "is_synthetic) FROM STDIN"
        ) as copy:
            for row in rows:
                copy.write_row((*row, 1.0, "feed", True))
        cur.execute(
            "INSERT INTO public.ai_personalization_settings (user_id, capture_explicit) VALUES (%s, false)",
            (_uuid("user", OPTOUT),),
        )
    return {"until": until, "events": len(rows), "opted_out": _uuid("user", OPTOUT)}


@pytest.fixture(scope="module")
def runs(conn: psycopg.Connection, seeded: dict[str, Any]) -> list[dict[str, Any]]:
    """The three runs of the job, in order, with the state after each."""
    until = seeded["until"]
    results = []
    for extra, env in ((["--synthetic"], None), (["--synthetic"], None), (["--synthetic"], {"OSML_FACTORS": "1"})):
        result = _run(until, extra, env)
        result["models"] = _models(conn)
        result["item_factors"] = _count(conn, "ai_rec_item_factors")
        result["user_factors"] = _count(conn, "ai_rec_user_factors")
        results.append(result)
    return results


def _matrix(conn: psycopg.Connection, until: datetime) -> tuple[Any, dict[str, int], dict[str, int]]:
    """The matrix of the whole window, the way the job builds it."""
    events = read_events(conn, until - timedelta(days=180), until, True)
    weighted = [event for event in events if event_weight(str(event["event"])) > 0.0]
    users = index_users(weighted)
    items = index_items(weighted)
    return build_matrix(weighted, users, items), users, items


def test_the_first_run_writes_the_champion(runs: list[dict[str, Any]]) -> None:
    run = runs[0]

    assert run["returncode"] == 0, run["stderr"]
    assert run["log"]["promoted"] is True
    assert len(run["models"]) == 1
    assert run["models"][0]["status"] == "champion"
    assert run["models"][0]["is_synthetic"] is True


def test_the_factor_counts_are_the_matrix_s(runs: list[dict[str, Any]], conn: Any, until: datetime) -> None:
    _, users, items = _matrix(conn, until)

    assert runs[0]["item_factors"] == len(items)
    assert runs[0]["user_factors"] == len(users)


def test_the_stored_vectors_are_padded(conn: Any, runs: list[dict[str, Any]]) -> None:
    model = runs[0]["models"][0]
    factors = int(model["factors"])
    with conn.cursor() as cur:
        cur.execute("SELECT factors::text FROM public.ai_rec_user_factors WHERE model_id = %s", (model["id"],))
        vectors = [row[0] for row in cur.fetchall()]

    assert vectors
    for text in vectors:
        numbers = [float(part) for part in text.strip("[]").split(",")]
        assert len(numbers) == 64
        assert numbers[factors:] == [0.0] * (64 - factors)


def test_the_database_inner_product_is_the_model_s_score(
    conn: Any,
    runs: list[dict[str, Any]],
    until: datetime,
) -> None:
    model = runs[0]["models"][0]
    matrix, users, items = _matrix(conn, until)
    served = train_ials(
        matrix,
        factors=int(model["factors"]),
        regularization=float(model["regularization"]),
        alpha=float(model["alpha"]),
        iterations=int(model["iterations"]),
        seed=SEED,
    )
    user_id = list(users)[0]
    _, item_id = list(items)[0].split(":", 1)
    expected = float(
        np.asarray(served.item_factors[0], dtype=np.float64) @ np.asarray(served.user_factors[0], dtype=np.float64)
    )
    with conn.cursor() as cur:
        cur.execute(
            "SELECT -(u.factors <#> i.factors) FROM public.ai_rec_user_factors u, public.ai_rec_item_factors i "
            "WHERE u.model_id = %s AND i.model_id = %s AND u.user_id = %s AND i.item_id = %s",
            (model["id"], model["id"], user_id, item_id),
        )
        actual = float(cur.fetchone()[0])

    assert abs(actual - expected) < 1e-4


def test_the_opted_out_user_has_no_vector(conn: Any, runs: list[dict[str, Any]]) -> None:
    opted_out = _uuid("user", OPTOUT)
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM public.ai_rec_user_factors WHERE user_id = %s", (opted_out,))
        vectors = int(cur.fetchone()[0])

    assert vectors == 0


def test_the_metrics_carry_the_protocol_s_keys(runs: list[dict[str, Any]]) -> None:
    metrics = runs[0]["models"][0]["metrics"]

    assert set(metrics) == {
        "ndcg10",
        "recall20",
        "holdout_from",
        "holdout_to",
        "holdout_users",
        "champion_twin_ndcg10",
        "eval",
    }
    assert metrics["eval"] == "time-split twin"
    assert metrics["champion_twin_ndcg10"] is None
    assert metrics["holdout_users"] > 0


def test_the_second_run_promotes_its_own_model(runs: list[dict[str, Any]]) -> None:
    run = runs[1]

    assert run["returncode"] == 0, run["stderr"]
    assert len(run["models"]) == 2
    assert run["log"]["promoted"] is True
    assert run["models"][0]["status"] == "retired"
    assert run["models"][1]["status"] == "champion"


def test_a_worse_model_stays_a_candidate(runs: list[dict[str, Any]]) -> None:
    run = runs[2]

    assert run["returncode"] == 0, run["stderr"]
    assert len(run["models"]) == 3
    assert run["log"]["promoted"] is False
    assert run["log"]["ndcg10"] < run["log"]["champion_twin_ndcg10"]
    assert run["models"][2]["status"] == "candidate"
    assert run["models"][1]["status"] == "champion"


def test_a_run_without_the_synthetic_flag_finds_no_real_events(conn: Any, seeded: dict[str, Any]) -> None:
    before = _count(conn, "ai_rec_models")
    run = _run(seeded["until"])

    assert run["returncode"] == 0, run["stderr"]
    assert run["log"]["skipped"] == "insufficient_data"
    assert _count(conn, "ai_rec_models") == before


def test_the_log_lines_carry_no_uuid(runs: list[dict[str, Any]]) -> None:
    pattern = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)

    for run in runs:
        for line in run["stdout"].splitlines():
            assert not pattern.search(line), line

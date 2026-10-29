"""The tests import `osml` from the package next to them.

The gates run `pytest services/osionos-ml/tests` from the repository root, so
the package's own directory has to be on the path.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def pytest_configure(config):
    """The `db` marker: the tests that need a database.

    They are skipped without a DATABASE_URL, and `scripts/test-db.sh` runs
    them against a throwaway one.
    """
    config.addinivalue_line("markers", "db: the tests that need a database (DATABASE_URL)")

"""The tests import `osml` from the package next to them.

The gates run `pytest services/osionos-ml/tests` from the repository root, so
the package's own directory has to be on the path.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

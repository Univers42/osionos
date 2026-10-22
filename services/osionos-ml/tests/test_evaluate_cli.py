"""The CLI refuses an --out that leaves the results directory."""

import pytest

from osml.evaluate import main


def test_out_outside_results_is_refused():
    with pytest.raises(SystemExit) as refused:
        main(["--out", "../outside"])

    assert refused.value.code != 0

"""The padding: the vectors the registry stores, and what it does with them.

The registry's column is `vector(64)` and a model with fewer factors is
stored zero-padded. The padding is exact: the inner product over the padded
pair is the inner product over the real one.
"""

import pytest

from osml.store import FACTOR_DIM, pad64

# The 16 real coordinates of a 16-factor model's vectors.
U16 = [0.5, -0.25, 0.125, 1.5, -2, 0.75, 3.25, -0.5, 0, 1.125, -1.75, 2.5, 0.375, -0.625, 4, 0.0625]
I16 = [1, 2, -0.5, 0.25, -3, 0.125, 0.5, 2.75, -1, 0.375, 1.25, -0.25, 0.0625, 3.5, -0.75, 1.5]


def test_a_sixteen_factor_vector_is_padded_with_forty_eight_zeros():
    padded = pad64(U16)

    assert len(padded) == FACTOR_DIM
    assert padded[:16] == U16
    assert padded[16:] == [0.0] * 48


def test_a_sixty_four_factor_vector_is_left_alone():
    vector = [float(n) / 7 for n in range(64)]

    assert pad64(vector) == vector


def test_a_vector_of_sixty_five_numbers_does_not_fit():
    with pytest.raises(ValueError):
        pad64([0.5] * 65)


def test_the_padded_inner_product_is_the_unpadded_one():
    plain = sum(u * i for u, i in zip(U16, I16, strict=True))
    padded = sum(u * i for u, i in zip(pad64(U16), pad64(I16), strict=True))

    assert padded == plain

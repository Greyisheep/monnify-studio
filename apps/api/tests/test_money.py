"""Money is exact to the kobo and never a float in a decision (D21)."""

from __future__ import annotations

from decimal import Decimal

from monnify_studio.money import covers, money


def test_classic_float_trap_is_exact():
    assert money(0.1) + money(0.2) == money(0.3)
    assert money("460.10") == Decimal("460.10")


def test_float_input_does_not_smuggle_binary_noise():
    # Decimal(0.1) carries noise; money(0.1) must not.
    assert money(0.1) == Decimal("0.10")


def test_covers_is_exact_at_the_kobo_boundary():
    assert covers(250000, 250000)  # exact payment settles
    assert covers("250000.01", 250000)  # a kobo over settles
    assert not covers("249999.99", 250000)  # one kobo short does NOT settle
    assert not covers(99.99, 100)  # underpayment rejected


def test_ints_and_strings_and_decimals_all_land_on_the_kobo():
    for v in (100, "100", "100.00", Decimal("100"), 100.0):
        assert money(v) == Decimal("100.00")

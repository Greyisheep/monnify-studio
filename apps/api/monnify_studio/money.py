"""Money is never a float here (D21).

A binary float cannot exactly represent most decimal money values (the classic
0.1 + 0.2 != 0.3), and the single comparison that guards a payment -- "did they
pay at least what they owe?" -- must be exact. We hold money as a Decimal
quantized to the kobo (NGN minor unit, 2 dp) and compare in that space.

Floats appear only at true I/O edges: the Monnify JSON payload and our own JSON
responses, where the wire format is a number. A float never reaches a decision.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

KOBO = Decimal("0.01")  # NGN minor unit; every amount is exact to this


def money(value: object) -> Decimal:
    """Coerce any incoming amount to a Decimal quantized to the kobo, exactly.

    Strings and ints parse exactly; a float is stringified first so that
    460.10 cannot smuggle binary noise (Decimal(0.1) != Decimal("0.1")).
    """
    if isinstance(value, Decimal):
        d = value
    elif isinstance(value, float):
        d = Decimal(str(value))
    elif isinstance(value, (int, str)):
        d = Decimal(value)
    else:  # last resort: stringify unknown numeric-likes
        d = Decimal(str(value))
    return d.quantize(KOBO, rounding=ROUND_HALF_UP)


def covers(paid: object, owed: object) -> bool:
    """True when `paid` settles at least `owed`, compared exactly in kobo.

    This is the money decision. It must never be a raw float `>=`.
    """
    return money(paid) >= money(owed)

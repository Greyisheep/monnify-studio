"""Moni's constrained output (#15, D16, D18).

Moni classifies intent and extracts config; she never emits a payment flow.
The output is a flat, schema-validated object so structured-output mode works on
every provider and a weak model cannot smuggle anything unsafe through.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class MoniIntent(BaseModel):
    """What Moni returns: which vetted template fits, plus extracted config."""

    template_id: str = "unknown"  # a known template id, or "unknown"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    business_name: str = ""
    product_name: str = ""
    price_ngn: int | None = None
    explanation: str = ""
    clarifying_question: str = ""

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


class MoniAnswer(BaseModel):
    """Moni's answer to a builder's "why" (#75). Sources are NOT part of the
    model output on purpose: the application attaches real doc references from
    the catalog, so a citation can never be an invented URL."""

    answer: str = ""


class MoniFlowNode(BaseModel):
    """One node in a composed flow. `type` must be a real catalog node type;
    the composer rejects anything else (D18: catalog-constrained creativity)."""

    id: str
    type: str
    label: str = ""


class MoniFlowEdge(BaseModel):
    source: str
    target: str
    kind: str = "control"  # "control" | "event" (event = async wait boundary, D1)


class MoniFlow(BaseModel):
    """A full flow Moni composes for the ceiling path (#15, D18).

    This is a proposal, never a product: it must survive catalog validation,
    the analyzer, and Apply-Fix before it reaches the canvas.
    """

    name: str
    description: str = ""
    explanation: str = ""
    nodes: list[MoniFlowNode] = Field(default_factory=list)
    edges: list[MoniFlowEdge] = Field(default_factory=list)

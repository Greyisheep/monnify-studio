"""A malformed model response must never 500; it retries then errors cleanly (#15).

Regression for the seam that surfaced as 'Failed to fetch' in the browser: a
truncated/invalid structured output raised a raw ValidationError -> 500 (and,
without CORS headers on the 500, a fetch failure in the UI).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import monnify_studio.ai.composer as comp
from monnify_studio.ai.composer import ComposeError, compose_flow
from monnify_studio.ai.schema import MoniFlow, MoniFlowEdge, MoniFlowNode
from monnify_studio.api.main import app

client = TestClient(app)

_GOOD = MoniFlow(
    name="Minimal",
    nodes=[
        MoniFlowNode(id="sched", type="event.scheduled"),
        MoniFlowNode(id="audit", type="safety.audit_event"),
    ],
    edges=[MoniFlowEdge(source="sched", target="audit", kind="event")],
)


class _Provider:
    """Fake provider: raises a parse error `bad` times, then returns _GOOD."""

    name = "fake"

    def __init__(self, bad: int) -> None:
        self.bad = bad
        self.calls = 0

    def available(self) -> bool:
        return True

    def structured(self, **_):
        self.calls += 1
        if self.calls <= self.bad:
            raise ValueError("truncated JSON")  # what a cut-off response looks like
        return _GOOD


def test_persistent_parse_failure_raises_composeerror(monkeypatch):
    prov = _Provider(bad=2)
    monkeypatch.setattr(comp, "select_provider", lambda p=None: prov)
    with pytest.raises(ComposeError):  # not a raw ValidationError / 500
        compose_flow("ajo app")
    assert prov.calls == 2  # first attempt + one corrective retry


def test_recovers_after_one_bad_parse(monkeypatch):
    prov = _Provider(bad=1)
    monkeypatch.setattr(comp, "select_provider", lambda p=None: prov)
    outcome = compose_flow("ajo app")
    assert outcome.provider == "fake"
    assert len(outcome.workflow.nodes) == 2


def test_endpoint_returns_422_not_500_on_bad_model(monkeypatch):
    monkeypatch.setattr(comp, "select_provider", lambda p=None: _Provider(bad=99))
    res = client.post("/assistant/compose", json={"message": "ajo"})
    assert res.status_code == 422  # clean error the browser can read, with CORS

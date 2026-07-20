"""Moni's ceiling: compose a flow, and the analyzer disposes (#15, D18)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import monnify_studio.ai.composer as composer_mod
from monnify_studio.ai.composer import ComposeError, ComposeUnavailable, compose_flow
from monnify_studio.ai.providers import KeywordFallback
from monnify_studio.ai.schema import MoniFlow, MoniFlowEdge, MoniFlowNode
from monnify_studio.api.main import app

client = TestClient(app)

# An ajo-shaped proposal with Moni's homework NOT done: the webhook feeds the
# ledger directly (no signature check, no verify, no idempotency).
UNSAFE_AJO = MoniFlow(
    name="Ajo contributions",
    description="Rotating savings: members contribute, one member gets the pot.",
    explanation="Members pay in monthly; on payout day the pot goes to one member.",
    nodes=[
        MoniFlowNode(id="init", type="monnify.initialize_transaction", label="Member Pays In"),
        MoniFlowNode(id="webhook", type="event.payment_webhook", label="Payment Webhook"),
        MoniFlowNode(id="credit", type="app.credit_ledger", label="Credit Pot"),
        MoniFlowNode(id="payday", type="event.scheduled", label="Payout Day"),
        MoniFlowNode(id="transfer", type="monnify.initiate_transfer", label="Pay Member"),
    ],
    edges=[
        MoniFlowEdge(source="init", target="webhook", kind="control"),
        MoniFlowEdge(source="webhook", target="credit", kind="event"),
        MoniFlowEdge(source="payday", target="transfer", kind="event"),
    ],
)


class _FakeProvider:
    name = "fake"

    def __init__(self, flows: list[MoniFlow]) -> None:
        self._flows = list(flows)
        self.calls = 0

    def available(self) -> bool:
        return True

    def structured(self, **kwargs):
        self.calls += 1
        return self._flows.pop(0)


def test_compose_pipeline_fixes_unsafe_proposal(monkeypatch):
    monkeypatch.setattr(
        composer_mod, "select_provider", lambda p=None: _FakeProvider([UNSAFE_AJO])
    )
    outcome = compose_flow("I want an ajo app")
    # Moni's raw proposal was unsafe; the gates caught and repaired it.
    caught = {f.rule_id for f in outcome.report_before.findings}
    assert "MON002" in caught  # webhook to ledger without signature check
    assert "MON011" in caught  # transfer without beneficiary validation
    assert outcome.report_after.findings == []
    assert outcome.steps  # Apply-Fix actually did work
    node_types = {n.type for n in outcome.workflow.nodes}
    assert "safety.verify_signature" in node_types


def test_invalid_node_types_get_one_retry_then_fail(monkeypatch):
    bad = MoniFlow(
        name="bad",
        nodes=[
            MoniFlowNode(id="a", type="monnify.hack_the_bank"),
            MoniFlowNode(id="b", type="app.notify"),
        ],
        edges=[MoniFlowEdge(source="a", target="b")],
    )
    fake = _FakeProvider([bad, bad])
    monkeypatch.setattr(composer_mod, "select_provider", lambda p=None: fake)
    with pytest.raises(ComposeError):
        compose_flow("anything")
    assert fake.calls == 2  # exactly one corrective retry


def test_keyword_fallback_cannot_compose(monkeypatch):
    monkeypatch.setattr(composer_mod, "select_provider", lambda p=None: KeywordFallback())
    with pytest.raises(ComposeUnavailable):
        compose_flow("ajo app")


def test_compose_endpoint_returns_editable_workflow(monkeypatch):
    monkeypatch.setattr(
        composer_mod, "select_provider", lambda p=None: _FakeProvider([UNSAFE_AJO])
    )
    res = client.post("/assistant/compose", json={"message": "I want an ajo app"})
    assert res.status_code == 200
    data = res.json()
    assert data["analysis"]["findings"] == []
    assert "MON002" in data["findings_caught"]
    wf_id = data["workflow"]["id"]
    # It lands in the store like any workflow: loadable, analyzable, editable.
    assert client.get(f"/workflows/{wf_id}").status_code == 200
    assert client.get(f"/workflows/{wf_id}/analysis").json()["findings"] == []


def test_compose_endpoint_503_without_provider(monkeypatch):
    monkeypatch.setattr(composer_mod, "select_provider", lambda p=None: KeywordFallback())
    res = client.post("/assistant/compose", json={"message": "ajo"})
    assert res.status_code == 503


def test_compose_stream_emits_status_and_result(monkeypatch):
    monkeypatch.setattr(
        composer_mod, "select_provider", lambda p=None: _FakeProvider([UNSAFE_AJO])
    )
    with client.stream(
        "POST",
        "/assistant/compose/stream",
        json={"message": "I want an ajo app"},
        headers={"Accept": "text/event-stream"},
    ) as response:
        assert response.status_code == 200
        body = response.read().decode()
    assert "event: status" in body
    assert "Designing nodes from the catalog" in body
    assert "event: result" in body
    assert "event: done" in body
    assert "Ajo contributions" in body

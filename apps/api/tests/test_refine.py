"""Moni corrects the flow on the whiteboard: same verify-refuse loop (#148)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import monnify_studio.ai.composer as composer_mod
from monnify_studio.ai.composer import ComposeRefused, refine_flow
from monnify_studio.ai.schema import MoniFlow, MoniFlowEdge, MoniFlowNode
from monnify_studio.api.main import app
from monnify_studio.store import store
from monnify_studio.templates import build_template

client = TestClient(app)

# A revision that adds a refund path to the invoice flow, but lazily: the
# refund is wired straight off the webhook with no verification homework.
LAZY_REVISION = MoniFlow(
    name="Invoices with Refunds",
    description="Invoice flow with a refund path.",
    explanation="Adds a refund path for disputed invoices.",
    nodes=[
        MoniFlowNode(id="create", type="monnify.create_invoice", label="Create Invoice"),
        MoniFlowNode(id="webhook", type="event.payment_webhook", label="Payment Webhook"),
        MoniFlowNode(id="paid", type="app.mark_order_paid", label="Mark Paid"),
        MoniFlowNode(id="refund", type="monnify.initiate_refund", label="Refund Dispute"),
    ],
    edges=[
        MoniFlowEdge(source="create", target="webhook", kind="control"),
        MoniFlowEdge(source="webhook", target="paid", kind="event"),
        MoniFlowEdge(source="paid", target="refund", kind="control"),
    ],
)

REFUSAL = MoniFlow(name="n/a", feasible=False, refusal="I only revise payment flows.")


class _FakeProvider:
    name = "fake"

    def __init__(self, flows: list[MoniFlow]) -> None:
        self._flows = list(flows)
        self.prompts: list[str] = []

    def available(self) -> bool:
        return True

    def structured(self, **kwargs):
        self.prompts.append(kwargs.get("user", ""))
        return self._flows.pop(0) if len(self._flows) > 1 else self._flows[0]


def test_refine_keeps_the_workflow_id_and_passes_the_analyzer(monkeypatch):
    fake = _FakeProvider([LAZY_REVISION])
    monkeypatch.setattr(composer_mod, "select_provider", lambda p=None: fake)
    current = build_template("invoice")
    current.id = "wf-under-edit"

    outcome = refine_flow(current, "add a refund path for disputes")
    # In-place revision: the canvas updates the same flow, no fork (#148).
    assert outcome.workflow.id == "wf-under-edit"
    # The lazy revision tripped the analyzer; Apply-Fix made it clean (D3 gate).
    assert outcome.report_after.findings == []
    assert outcome.report_before.findings, "the lazy revision should trip findings"


def test_refine_prompt_carries_the_current_flow_and_instruction(monkeypatch):
    fake = _FakeProvider([LAZY_REVISION])
    monkeypatch.setattr(composer_mod, "select_provider", lambda p=None: fake)
    current = build_template("invoice")

    refine_flow(current, "add a refund path for disputes")
    prompt = fake.prompts[0]
    assert "already has this flow" in prompt
    assert "Create Invoice" in prompt  # the whiteboard's real nodes are in there
    assert "add a refund path for disputes" in prompt
    assert "FULL revised flow" in prompt


def test_refine_refuses_non_payment_instructions(monkeypatch):
    monkeypatch.setattr(
        composer_mod, "select_provider", lambda p=None: _FakeProvider([REFUSAL])
    )
    with pytest.raises(ComposeRefused):
        refine_flow(build_template("invoice"), "make me a rocket")


def test_refine_endpoint_updates_the_stored_flow(monkeypatch):
    fake = _FakeProvider([LAZY_REVISION])
    monkeypatch.setattr(composer_mod, "select_provider", lambda p=None: fake)
    wf = client.post("/workflows/from-template/invoice").json()["workflow"]

    res = client.post(
        "/assistant/refine",
        json={"workflow_id": wf["id"], "message": "add a refund path"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["workflow"]["id"] == wf["id"]  # same flow, updated in place
    assert body["analysis"]["findings"] == []
    assert body["findings_caught"], "the caught-then-fixed story travels to the UI"
    # The store now holds the revised flow under the same id.
    assert store.get(wf["id"]).name == "Invoices with Refunds"


def test_refine_endpoint_404_for_unknown_flow():
    res = client.post(
        "/assistant/refine", json={"workflow_id": "nope", "message": "fix it"}
    )
    assert res.status_code == 404

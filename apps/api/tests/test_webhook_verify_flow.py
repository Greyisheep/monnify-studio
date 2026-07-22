"""A card->webhook->verify->notify flow must COMPLETE against the sandbox (#Flow 1).

When Moni composes a webhook-driven flow, `verify` hangs off the webhook island,
so no direct edge carries the initialize's payment_reference. Verify must still
find the one real reference the run minted (from the initialize) and query it,
instead of dead-ending at "no payment_reference" - which mislabels the run as
FAILED and starves the downstream notify node.
"""

from __future__ import annotations

from decimal import Decimal

from monnify_studio.config import Settings
from monnify_studio.executor import RunStatus, execution_store, run_workflow
from monnify_studio.executor.adapter import SandboxAdapter, _run_payment_reference
from monnify_studio.ir.models import Edge, Node, Workflow


class _FakeMonnify:
    """Records what verify was asked to query, returns provider truth."""

    def __init__(self) -> None:
        self.queried: list[str] = []

    def initialize_transaction(self, *, amount, reference, **_):
        return {
            "checkout_url": "https://sandbox.monnify.com/checkout/real",
            "payment_reference": "pay-real-123",
            "transaction_reference": "MNFY|real",
        }

    def query_transaction(self, *, payment_reference):
        self.queried.append(payment_reference)
        return {"status": "PENDING", "amount_paid": Decimal("0")}


def _webhook_first_flow() -> Workflow:
    """init is an island; the webhook island drives verify -> notify."""
    return Workflow(
        id="wh", name="card-webhook-verify-notify", entrypoint="init",
        nodes=[
            Node(id="init", type="monnify.initialize_transaction", config={"amount": "7500"}),
            Node(id="hook", type="event.payment_webhook"),
            Node(id="verify", type="monnify.verify_transaction"),
            Node(id="notify", type="app.notify_whatsapp", config={"message": "Payment confirmed"}),
        ],
        edges=[
            Edge(source="hook", target="verify", kind="event"),
            Edge(source="verify", target="notify"),
        ],
    )


def _sandbox_adapter() -> tuple[SandboxAdapter, _FakeMonnify]:
    adapter = SandboxAdapter(
        Settings(monnify_api_key="k", monnify_secret_key="s", monnify_contract_code="c")
    )
    fake = _FakeMonnify()
    adapter._client = fake  # _c() returns the set client, so no network
    return adapter, fake


def test_run_payment_reference_finds_the_real_ref() -> None:
    context = {"outputs": {"init": {"payment_reference": "pay-real-123"}, "hook": {"event": "arrived"}}}
    assert _run_payment_reference(context) == "pay-real-123"
    assert _run_payment_reference({"outputs": {}}) is None


def test_webhook_first_flow_completes_and_verifies_real_reference() -> None:
    adapter, fake = _sandbox_adapter()
    run = run_workflow(_webhook_first_flow(), adapter=adapter)

    # The run completes instead of failing at verify...
    assert run.status is RunStatus.COMPLETED
    # ...because verify queried the REAL reference the initialize minted...
    assert fake.queried == ["pay-real-123"]
    # ...and the downstream notify node actually ran.
    node_ids = {e.node_id for e in execution_store.list_events(run.id) if e.node_id}
    assert {"init", "hook", "verify", "notify"} <= node_ids

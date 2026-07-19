"""The flagship D17 template: sell online with verified payments (#51).

The seller's mental model is the top row: share a payment link, customer says
"I've paid", show them something reassuring. The bottom row is the truth path
Studio insists on: nothing is marked paid until the webhook is authenticated
and Monnify's verify-transaction confirms the exact amount, once.

This is the same architecture the fake-credit-alert demo beat (#53) exercises:
the callback row can never grant value, so a doctored screenshot changes
nothing.

Must analyze clean (zero findings): the analyzer is the guarantee we sell.
"""

from __future__ import annotations

from ..ir.models import Edge, Node, Position, Variable, Workflow


def _n(node_id: str, type_: str, label: str, x: int, y: int) -> Node:
    return Node(id=node_id, type=type_, label=label, position=Position(x=x, y=y))


def sell_online() -> Workflow:
    """Payment link -> verified order. Expected findings: none."""
    nodes = [
        # Row 1: what the seller and customer see. Informational only (MON001).
        _n("init", "monnify.initialize_transaction", "Create Payment Link", 0, 0),
        _n("callback", "event.client_callback", "Customer Says 'I've Paid'", 240, 0),
        _n("notify", "app.notify", "Show 'Awaiting Confirmation'", 480, 0),
        # Row 2: the truth path. Only Monnify's word marks an order paid.
        _n("webhook", "event.payment_webhook", "Monnify Payment Webhook", 0, 170),
        _n("vsig", "safety.verify_signature", "Verify Webhook Signature", 240, 170),
        _n("verify", "monnify.verify_transaction", "Verify Transaction", 480, 170),
        _n("vamt", "safety.validate_amount", "Validate Amount (full price)", 720, 170),
        _n("idem", "safety.idempotency_guard", "Idempotency Guard", 960, 170),
        _n("paid", "app.mark_order_paid", "Mark Order Paid (Verified)", 1200, 170),
    ]
    edges = [
        Edge(source="init", target="callback"),
        Edge(source="callback", target="notify", kind="event"),
        Edge(source="webhook", target="vsig", kind="event"),
        Edge(source="vsig", target="verify"),
        Edge(source="verify", target="vamt"),
        Edge(source="vamt", target="idem"),
        Edge(source="idem", target="paid"),
    ]
    return Workflow(
        id="sell-online",
        name="Sell Online with Verified Payments",
        provider="monnify",
        description=(
            "Payment link and orders flow for a small online seller. Orders are "
            "marked paid only after server-side verification (D17)."
        ),
        variables={
            "order_reference": Variable(name="order_reference"),
            "expected_amount": Variable(name="expected_amount"),
        },
        nodes=nodes,
        edges=edges,
        entrypoint="init",
    )

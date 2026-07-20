"""The invoice template: bill a client, share a link, get verified money (#85).

Top row is the merchant's action: create the invoice and send the link. Bottom
row is the same truth path every product here shares: nothing is marked paid
until the webhook is authenticated and Monnify confirms the exact amount, once.
Settlement lands in the merchant's Monnify (Moniepoint) account.

Must analyze clean: the analyzer is the guarantee we sell.
"""

from __future__ import annotations

from ..ir.models import Edge, Node, Position, Variable, Workflow


def _n(node_id: str, type_: str, label: str, x: int, y: int) -> Node:
    return Node(id=node_id, type=type_, label=label, position=Position(x=x, y=y))


def invoice() -> Workflow:
    """Invoice -> link -> verified payment. Expected findings: none."""
    nodes = [
        # Row 1: the merchant's side.
        _n("create", "monnify.create_invoice", "Create Invoice", 0, 0),
        _n("send", "app.notify", "Send Invoice Link", 240, 0),
        # Row 2: the truth path; only Monnify's word marks an invoice paid.
        _n("webhook", "event.payment_webhook", "Monnify Payment Webhook", 0, 170),
        _n("vsig", "safety.verify_signature", "Verify Webhook Signature", 240, 170),
        _n("verify", "monnify.verify_transaction", "Verify Transaction", 480, 170),
        _n("vamt", "safety.validate_amount", "Validate Amount (full invoice)", 720, 170),
        _n("idem", "safety.idempotency_guard", "Idempotency Guard", 960, 170),
        _n("paid", "app.mark_order_paid", "Mark Invoice Paid", 1200, 170),
        _n("receipt", "app.notify", "Send Receipt to Buyer", 1440, 170),
    ]
    edges = [
        Edge(source="create", target="send"),
        Edge(source="webhook", target="vsig", kind="event"),
        Edge(source="vsig", target="verify"),
        Edge(source="verify", target="vamt"),
        Edge(source="vamt", target="idem"),
        Edge(source="idem", target="paid"),
        Edge(source="paid", target="receipt"),
    ]
    return Workflow(
        id="invoice",
        name="Invoices with Verified Payments",
        provider="monnify",
        description=(
            "Create invoices, share a payment link, and mark them paid only after "
            "Monnify confirms the money in your account (#85, D17)."
        ),
        variables={
            "invoice_reference": Variable(name="invoice_reference"),
            "expected_amount": Variable(name="expected_amount"),
        },
        nodes=nodes,
        edges=edges,
        entrypoint="create",
    )

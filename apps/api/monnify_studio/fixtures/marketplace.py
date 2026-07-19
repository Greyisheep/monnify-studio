"""The hero workflow: a payout-after-fulfilment marketplace (D7, D10).

Story: customers pay upfront, the platform holds the money, and the provider is
paid only after the customer confirms the job. Two versions:

  * `unsafe_marketplace()` — what a naive integration looks like. It trusts a
    client callback, processes a webhook with no signature/idempotency, and
    reaches for Transaction Split (which pays the provider immediately). This is
    the graph Studio lights up with findings.
  * `safe_marketplace()`  — the architecture after remediation. Zero findings.

Keeping both as code (rather than only JSON) makes the intended contrast
executable and lets tests assert exactly which rules should fire.
"""

from __future__ import annotations

from ..ir.models import Edge, Node, Position, Variable, Workflow


def _n(node_id: str, type_: str, label: str, x: int, y: int, **kw) -> Node:
    return Node(id=node_id, type=type_, label=label, position=Position(x=x, y=y), **kw)


def unsafe_marketplace() -> Workflow:
    """Intentionally-unsafe hero. Expected findings: MON001, MON002, MON003, MON009."""
    nodes = [
        _n("init", "monnify.initialize_transaction", "Initialize Payment", 0, 0),
        _n("split", "monnify.transaction_split", "Split to Provider (5%/95%)", 220, 0),
        _n("callback", "event.client_callback", "Customer Returns (callback)", 440, 0),
        _n("webhook", "event.payment_webhook", "Payment Webhook", 440, 160),
        _n("fulfil", "app.mark_order_paid", "Mark Booking Funded", 700, 80),
        _n("confirm", "event.fulfilment_confirmed", "Customer Confirms Job", 0, 300),
        _n("payout", "app.release_payout", "Release Provider Payout", 260, 300),
    ]
    edges = [
        Edge(source="init", target="split"),
        Edge(source="split", target="callback"),
        Edge(source="callback", target="fulfil", kind="event"),
        Edge(source="webhook", target="fulfil", kind="event"),
        Edge(source="confirm", target="payout", kind="event"),
    ]
    return Workflow(
        id="marketplace-unsafe",
        name="Marketplace — Unsafe",
        provider="monnify",
        description="Naive payout-after-fulfilment marketplace with unsafe integration patterns.",
        variables={
            "order_id": Variable(name="order_id"),
            "expected_amount": Variable(name="expected_amount"),
        },
        nodes=nodes,
        edges=edges,
        entrypoint="init",
    )


def safe_marketplace() -> Workflow:
    """The corrected hero. Expected findings: none."""
    nodes = [
        # Collection: the browser callback is informational only.
        _n("init", "monnify.initialize_transaction", "Initialize Payment", 0, 0),
        _n("callback", "event.client_callback", "Customer Returns (callback)", 240, 0),
        _n("notify", "app.notify", "Show 'Processing' (no value granted)", 480, 0),
        # Authoritative path runs off the webhook.
        _n("webhook", "event.payment_webhook", "Payment Webhook", 0, 160),
        _n("vsig", "safety.verify_signature", "Verify Signature", 240, 160),
        _n("verify", "monnify.verify_transaction", "Verify Transaction", 480, 160),
        _n("vamt", "safety.validate_amount", "Validate Amount", 720, 160),
        _n("idem", "safety.idempotency_guard", "Idempotency Guard", 960, 160),
        _n("fulfil", "app.mark_order_paid", "Mark Booking Funded", 1200, 160),
        # Payout waits for fulfilment, then moves money via Transfer.
        _n("confirm", "event.fulfilment_confirmed", "Customer Confirms Job", 0, 340),
        _n("idem2", "safety.idempotency_guard", "Idempotency Guard (payout)", 260, 340),
        _n("transfer", "monnify.initiate_transfer", "Transfer to Provider (minus 5%)", 520, 340),
        _n("qstatus", "monnify.query_transfer_status", "Query Transfer Status", 800, 340),
        _n("audit", "safety.audit_event", "Audit", 1060, 340),
        # Reconciliation catches provider/local divergence.
        _n("sched", "event.scheduled", "Nightly Reconciliation", 0, 500),
        _n("recon", "safety.reconciliation", "Reconcile", 240, 500),
        _n("audit2", "safety.audit_event", "Audit", 480, 500),
    ]
    edges = [
        Edge(source="init", target="callback"),
        Edge(source="callback", target="notify", kind="event"),
        Edge(source="webhook", target="vsig", kind="event"),
        Edge(source="vsig", target="verify"),
        Edge(source="verify", target="vamt"),
        Edge(source="vamt", target="idem"),
        Edge(source="idem", target="fulfil"),
        Edge(source="confirm", target="idem2", kind="event"),
        Edge(source="idem2", target="transfer"),
        Edge(source="transfer", target="qstatus"),
        Edge(source="qstatus", target="audit"),
        Edge(source="sched", target="recon", kind="event"),
        Edge(source="recon", target="audit2"),
    ]
    return Workflow(
        id="marketplace-safe",
        name="Marketplace — Safe",
        provider="monnify",
        description="Payout-after-fulfilment marketplace with verification, idempotency, "
        "conditional payout via Transfer, and reconciliation.",
        variables={
            "order_id": Variable(name="order_id"),
            "expected_amount": Variable(name="expected_amount"),
        },
        nodes=nodes,
        edges=edges,
        entrypoint="init",
    )

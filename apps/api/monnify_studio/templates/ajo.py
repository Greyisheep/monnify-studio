"""The ajo / thrift-contribution template: a rotating savings pool (ROSCA).

Everyone contributes into the shared pool each cycle, and at the end of the cycle
ONE member collects the WHOLE pot. The turn rotates, so over a full round every
member gets one payout of the entire pool (#134, #105).

Three paths, all analyzer-clean:
  - Setup: give each member a dedicated account and send the details.
  - Money in: a contribution webhook is authenticated and confirmed with Monnify
    before it credits the member's ledger (no fake-alert screenshots).
  - Money out: on payout day the pool only pays after checking it covers the
    amount (MON012), and only to an account validated by name (MON011).

Must analyze clean: the analyzer is the guarantee we sell.
"""

from __future__ import annotations

from ..ir.models import Edge, Node, Position, Variable, Workflow


def _n(node_id: str, type_: str, label: str, x: int, y: int) -> Node:
    return Node(id=node_id, type=type_, label=label, position=Position(x=x, y=y))


def ajo() -> Workflow:
    """Contributions in, scheduled payout out. Expected findings: none."""
    nodes = [
        # Row 1: setup - a dedicated account per member.
        _n("accounts", "monnify.create_reserved_account", "Give Each Member an Account", 0, 0),
        _n("send_acct", "app.notify", "Send Account Details to Members", 300, 0),
        # Row 2: money in - each contribution, only credited after Monnify confirms.
        _n("webhook", "event.payment_webhook", "Contribution Received", 0, 170),
        _n("vsig", "safety.verify_signature", "Verify Webhook Signature", 300, 170),
        _n("verify", "monnify.verify_transaction", "Verify Contribution", 600, 170),
        _n("vamt", "safety.validate_amount", "Validate Contribution Amount", 900, 170),
        _n("idem", "safety.idempotency_guard", "Idempotency Guard", 1200, 170),
        _n("credit", "app.credit_ledger", "Credit Member Contribution", 1500, 170),
        _n("notify_in", "app.notify", "Tell Member: Contribution Received", 1800, 170),
        # Row 3: money out - the scheduled payout to this cycle's member.
        _n("schedule", "event.scheduled", "Payout Day (this member's turn)", 0, 340),
        _n("balance", "safety.balance_guard", "Check Pool Covers Payout", 300, 340),
        _n("valbank", "monnify.validate_bank_account", "Validate Receiver Account", 600, 340),
        _n("payout", "monnify.initiate_transfer", "Pay the Whole Pot to This Member", 900, 340),
        _n("status", "monnify.query_transfer_status", "Check Payout Status", 1200, 340),
        _n("recon", "safety.reconciliation", "Reconcile the Pool", 1500, 340),
        _n("notify_out", "app.notify", "Tell Member: You Collected the Pot", 1800, 340),
    ]
    edges = [
        Edge(source="accounts", target="send_acct"),
        # money-in path (event trigger)
        Edge(source="webhook", target="vsig", kind="event"),
        Edge(source="vsig", target="verify"),
        Edge(source="verify", target="vamt"),
        Edge(source="vamt", target="idem"),
        Edge(source="idem", target="credit"),
        Edge(source="credit", target="notify_in"),
        # money-out path (scheduled trigger)
        Edge(source="schedule", target="balance", kind="event"),
        Edge(source="balance", target="valbank"),
        Edge(source="valbank", target="payout"),
        Edge(source="payout", target="status"),
        Edge(source="status", target="recon"),
        Edge(source="recon", target="notify_out"),
    ]
    return Workflow(
        id="ajo",
        name="Ajo / Thrift Contributions",
        provider="monnify",
        description=(
            "A rotating savings pool (ROSCA / ajo / esusu). Members contribute into "
            "the shared pool through their own dedicated accounts, each contribution "
            "credited only after Monnify confirms it. At the end of each cycle one "
            "member collects the WHOLE pot, and the turn rotates so everyone gets a "
            "turn over the full round. The payout only leaves after the pool is "
            "checked and the receiver's account is validated (#134, #105)."
        ),
        variables={
            "member_reference": Variable(name="member_reference"),
            "contribution_amount": Variable(name="contribution_amount"),
            "payout_amount": Variable(name="payout_amount"),
        },
        nodes=nodes,
        edges=edges,
        entrypoint="accounts",
    )

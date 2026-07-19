"""The payment-correctness rule set (MON001–MON009).

Each rule is a small function over an `Analysis`. They are deliberately
explicit and provider-agnostic: no rule reads a node's type, only its
capability tags. Adding a rule is adding a function to `RULES`.

Traceability: #5 (P1.3 — static analysis engine); decisions D3, D10 (MON009).
"""

from __future__ import annotations

from typing import Callable

from ..ir.types import CapabilityTag as T
from ..ir.types import Severity
from .engine import Analysis, Finding

Rule = Callable[[Analysis], list[Finding]]

DOCS_COLLECTIONS = "https://developers.monnify.com/docs/collections"
DOCS_LIVE = "https://developers.monnify.com/docs/live"
DOCS_API = "https://developers.monnify.com/api"


def mon001_client_callback_as_truth(a: Analysis) -> list[Finding]:
    """A financial fulfilment is reachable from a client callback with no
    authoritative server-side verification in between."""
    findings: list[Finding] = []
    is_fulfil = a.has_pred(T.FINANCIAL_FULFILMENT)
    is_verify = a.has_pred(T.AUTHORITATIVE_VERIFICATION)
    for src in a.nodes_with(T.CLIENT_CALLBACK):
        for path in a.unguarded_targets(src, is_fulfil, is_verify):
            findings.append(
                Finding(
                    rule_id="MON001",
                    severity=Severity.CRITICAL,
                    title="Client callback used as financial truth",
                    message="Value is granted based on client-controlled state that can be forged.",
                    node_ids=[src, path[-1]],
                    path=path,
                    explanation=(
                        "A browser redirect or client callback can be manipulated by the payer. "
                        "Verify the transaction server-side with Monnify before granting value."
                    ),
                    remediation="Insert Verify Transaction → Validate Amount → Idempotency Guard "
                    "before the fulfilment step.",
                    doc_url=DOCS_COLLECTIONS,
                )
            )
    return findings


def mon002_missing_signature_check(a: Analysis) -> list[Finding]:
    """Webhook payload reaches business logic without signature verification."""
    findings: list[Finding] = []
    def is_effect(nid: str) -> bool:
        return a.has_tag(nid, T.FINANCIAL_FULFILMENT) or a.has_tag(nid, T.MUTATES_LEDGER)

    is_sig = a.has_pred(T.SIGNATURE_CHECK)
    for src in a.nodes_with(T.WEBHOOK_EVENT):
        for path in a.unguarded_targets(src, is_effect, is_sig):
            findings.append(
                Finding(
                    rule_id="MON002",
                    severity=Severity.CRITICAL,
                    title="Missing webhook signature verification",
                    message="An attacker could forge a payment event and trigger business logic.",
                    node_ids=[src, path[-1]],
                    path=path,
                    explanation=(
                        "Webhooks are unauthenticated until you validate the transaction hash / "
                        "signature. Verify it before any effect runs."
                    ),
                    remediation="Insert Verify Webhook Signature immediately after the webhook node.",
                    doc_url=DOCS_COLLECTIONS,
                )
            )
    return findings


def mon003_missing_idempotency(a: Analysis) -> list[Finding]:
    """A repeatable event reaches a financial effect with no idempotency boundary."""
    findings: list[Finding] = []
    def is_effect(nid: str) -> bool:
        return a.has_tag(nid, T.FINANCIAL_FULFILMENT) or a.has_tag(nid, T.MUTATES_LEDGER)

    is_idem = a.has_pred(T.IDEMPOTENCY_BOUNDARY)
    for src in a.nodes_with(T.WEBHOOK_EVENT):
        for path in a.unguarded_targets(src, is_effect, is_idem):
            findings.append(
                Finding(
                    rule_id="MON003",
                    severity=Severity.HIGH,
                    title="Missing idempotency boundary",
                    message="A duplicate webhook or retry could create a duplicate financial effect.",
                    node_ids=[src, path[-1]],
                    path=path,
                    explanation=(
                        "Providers may deliver a webhook more than once. Without an idempotency "
                        "key guarding the effect, the customer can be credited twice."
                    ),
                    remediation="Insert an Idempotency Guard keyed on the payment reference before "
                    "the effect.",
                    doc_url=DOCS_COLLECTIONS,
                )
            )
    return findings


def mon004_amount_not_validated(a: Analysis) -> list[Finding]:
    """Verified, but the amount paid is never compared to the expected amount."""
    findings: list[Finding] = []
    is_fulfil = a.has_pred(T.FINANCIAL_FULFILMENT)
    is_amount = a.has_pred(T.AMOUNT_VALIDATION)
    for src in a.nodes_with(T.AUTHORITATIVE_VERIFICATION):
        for path in a.unguarded_targets(src, is_fulfil, is_amount):
            findings.append(
                Finding(
                    rule_id="MON004",
                    severity=Severity.HIGH,
                    title="Amount paid not validated",
                    message="An underpaid transaction could still be fulfilled at full value.",
                    node_ids=[src, path[-1]],
                    path=path,
                    explanation=(
                        "Verification confirms a payment happened, not that the correct amount "
                        "was paid. Compare amountPaid against the expected amount before fulfilling."
                    ),
                    remediation="Insert Validate Amount between verification and fulfilment.",
                    doc_url=DOCS_API,
                )
            )
    return findings


def mon009_immediate_split_before_conditional_payout(a: Analysis) -> list[Finding]:
    """Immediate transaction-split used where the payout is meant to be gated by
    a downstream event (the D10 insight)."""
    if not a.any_with(T.IMMEDIATE_SPLIT):
        return []
    if not a.any_with(T.CONDITIONAL_PAYOUT):
        return []
    split_nodes = a.nodes_with(T.IMMEDIATE_SPLIT)
    gate_nodes = a.nodes_with(T.CONDITIONAL_PAYOUT)
    return [
        Finding(
            rule_id="MON009",
            severity=Severity.CRITICAL,
            title="Immediate split contradicts payout-after-fulfilment",
            message="Transaction split settles to the provider at payment time — before fulfilment "
            "is confirmed, so the provider is paid for work not yet done.",
            node_ids=split_nodes + gate_nodes,
            explanation=(
                "Transaction Split disburses immediately when the customer pays. This workflow also "
                "gates payout on a fulfilment event, so the two are contradictory. Collect the full "
                "amount, hold it, and pay the provider via Transfer only after fulfilment."
            ),
            remediation="Replace Transaction Split with: Hold Funds → (wait for Fulfilment) → "
            "Initiate Transfer to the provider.",
            doc_url=DOCS_API,
        )
    ]


RULES: list[Rule] = [
    mon001_client_callback_as_truth,
    mon002_missing_signature_check,
    mon003_missing_idempotency,
    mon004_amount_not_validated,
    mon009_immediate_split_before_conditional_payout,
]

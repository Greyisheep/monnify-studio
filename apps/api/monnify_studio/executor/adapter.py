"""Adapter seam: one interpreter, swappable adapters (D2, #8).

MockAdapter is the reliability path for demos/tests (D11). MonnifyAdapter plugs
in later (#9) without changing the event stream format.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from ..ir.models import Node
from ..money import covers, money
from ..observability.redaction import redact


@dataclass
class AdapterResult:
    ok: bool = True
    duration_ms: int = 5
    outputs: dict[str, Any] = field(default_factory=dict)
    request: dict[str, Any] = field(default_factory=dict)
    response: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    # Event/wait nodes pause the machine until something external arrives (D1).
    waiting: bool = False


class Adapter(Protocol):
    name: str

    def invoke(self, node: Node, context: dict[str, Any]) -> AdapterResult: ...


_DEFAULT_AMOUNT = "10000"


def _amount_in(inputs: dict[str, Any], config: dict[str, Any]) -> str:
    """The amount a node acts on: its own config wins, else what flowed in,
    else a visible default. Kept as an exact string end to end (D21)."""
    for source in (config, inputs):
        for key in ("amount", "paid_amount", "expected_amount", "price_ngn"):
            value = source.get(key)
            if value not in (None, ""):
                return str(money(value))
    return str(money(_DEFAULT_AMOUNT))


class MockAdapter:
    """Deterministic input-aware stubs so traces work with no sandbox (#8, D11).

    Real data flow (#145): outputs are DERIVED from what flowed in (upstream
    outputs, resolved by the engine into `context["inputs"]`) plus the node's
    own config - never canned per type. Edit a node's amount and every
    downstream number changes on the next run; that is the point. We own the
    interpreter, so no hacky capture is needed (the managed-runtime advantage).
    """

    name = "mock"

    def invoke(self, node: Node, context: dict[str, Any]) -> AdapterResult:
        inputs: dict[str, Any] = context.get("inputs", {}) or {}
        config: dict[str, Any] = node.config or {}
        is_wait = node.type.startswith("event.")
        amount = _amount_in(inputs, config)

        # Config genuinely drives the request body (#145, dev item 4): what a
        # dev edits on the node is what the "API" is called with.
        request = redact(
            {
                "method": "MOCK",
                "path": f"/mock/{node.type}",
                "body": {"node_id": node.id, "config": config, "inputs": inputs},
            }
        )

        # Derived, not canned: every branch passes the flowing values forward.
        outputs: dict[str, Any] = {"status": "ok", "amount": amount}
        if node.type.startswith("monnify.initialize") or node.type == "monnify.create_invoice":
            outputs.update(
                checkout_url="https://sandbox.monnify.com/checkout/mock",
                payment_reference=f"pay-{node.id}",
            )
        elif node.type == "monnify.create_reserved_account":
            outputs.update(account_number="9876543210", bank="Moniepoint MFB")
        elif node.type.startswith("event."):
            # The simulated external event delivers the amount the flow expects.
            outputs.update(paid_amount=amount, event="arrived")
        elif node.type.startswith("monnify.verify"):
            paid = str(money(inputs.get("paid_amount", amount)))
            outputs.update(paid_amount=paid, payment_status="PAID")
        elif node.type == "safety.validate_amount":
            expected = str(money(config.get("expected_amount", amount)))
            paid = str(money(inputs.get("paid_amount", amount)))
            outputs.update(expected_amount=expected, paid_amount=paid, valid=covers(paid, expected))
        elif node.type == "safety.balance_guard":
            balance = str(money(config.get("balance", money(amount) * 2)))
            outputs.update(balance=balance, covers_payout=covers(balance, amount))
        elif node.type.startswith("monnify.initiate_transfer") or node.type == "monnify.bulk_transfer":
            outputs.update(transfer_reference=f"xfer-{node.id}")
        elif node.type == "app.credit_ledger":
            outputs.update(credited=amount)
        elif node.type == "custom.code":
            # Honest v1 (#147): declared outputs flow downstream; the snippet
            # itself is NOT executed server-side (sandboxed runtime is the
            # post-deadline slice - running arbitrary user code unsandboxed
            # would be reckless).
            declared = config.get("outputs")
            if isinstance(declared, dict) and declared:
                outputs.update(declared)

        response = redact(
            {
                "status": 200,
                "body": {
                    "ok": True,
                    "node_id": node.id,
                    "simulated": True,
                    **outputs,
                    # Intentionally include a sensitive key so redaction is proven.
                    "api_key": "should-never-leak-in-trace",
                },
            }
        )

        return AdapterResult(
            ok=True,
            duration_ms=8 if is_wait else 12,
            outputs=outputs,
            request=request,
            response=response,
            waiting=is_wait,
        )

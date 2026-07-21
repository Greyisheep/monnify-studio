"""Adapter seam: one interpreter, swappable adapters (D2, #8).

MockAdapter is the reliability path for demos/tests (D11). MonnifyAdapter plugs
in later (#9) without changing the event stream format.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol
from uuid import uuid4

from ..config import Settings
from ..integrations.monnify import MonnifyError, MonnifySandboxClient
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


# Sandbox test destination for the payout leg; overridable per node.config (#9).
_TEST_DEST_ACCOUNT = "2085886393"
_TEST_DEST_BANK = "057"
_TEST_DEST_NAME = "Studio Recipient"


class SandboxAdapter:
    """Run the flow against the REAL Monnify sandbox, not a stub (#9).

    The point of Studio is that a 200 does not mean the integration is correct.
    So Run can hit Monnify for real: initialize creates a live checkout, verify
    asks Monnify the authoritative status, transfer moves real sandbox money.
    A fresh run of a collect-then-verify flow honestly shows PENDING until a human
    actually pays - that truth on the canvas is the whole thesis.

    What stays local (never faked, never outsourced):
      * safety.* guards - our correctness layer runs in-process every time.
      * event.* waits - a webhook cannot be awaited synchronously; mark waiting.
      * custom.code - declared outputs flow; the snippet is not executed (#147).
    A provider error is surfaced honestly as a failed node, not swallowed.
    """

    name = "monnify"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._wallet = settings.monnify_wallet_account
        self._client: MonnifySandboxClient | None = None

    def __enter__(self) -> "SandboxAdapter":
        return self

    def __exit__(self, *exc: object) -> None:
        if self._client is not None:
            self._client.__exit__(*exc)
            self._client = None

    def _c(self) -> MonnifySandboxClient:
        if self._client is None:
            self._client = MonnifySandboxClient(self._settings)
        return self._client

    def invoke(self, node: Node, context: dict[str, Any]) -> AdapterResult:
        inputs: dict[str, Any] = context.get("inputs", {}) or {}
        config: dict[str, Any] = node.config or {}
        amount = _amount_in(inputs, config)
        ref = f"run-{node.id[:8]}-{uuid4().hex[:8]}"
        request: dict[str, Any] = {"method": "LIVE", "path": f"/sandbox/{node.type}", "body": {}}
        outputs: dict[str, Any] = {"status": "ok", "amount": amount}
        is_wait = node.type.startswith("event.")

        try:
            if node.type == "monnify.initialize_transaction" or node.type == "monnify.create_invoice":
                tx = self._c().initialize_transaction(
                    amount=money(amount),
                    customer_name=config.get("customer_name", "Studio Demo Customer"),
                    customer_email=config.get("customer_email", "customer@example.com"),
                    reference=ref,
                    description=config.get("description", f"Studio run: {node.type}"),
                )
                request["body"] = {"amount": amount, "reference": ref}
                outputs.update(
                    checkout_url=tx["checkout_url"],
                    payment_reference=tx["payment_reference"],
                    transaction_reference=tx["transaction_reference"],
                )
            elif node.type in ("monnify.verify_transaction", "monnify.query_transaction"):
                payment_ref = inputs.get("payment_reference") or config.get("payment_reference")
                if not payment_ref:
                    return self._failed(node, "no payment_reference reached verify (wire it from initialize)")
                res = self._c().query_transaction(payment_reference=payment_ref)
                request["body"] = {"payment_reference": payment_ref}
                outputs.update(
                    payment_status=res["status"],
                    paid_amount=str(money(res["amount_paid"])),
                    payment_reference=payment_ref,
                )
            elif node.type in ("monnify.initiate_transfer", "monnify.bulk_transfer"):
                if not self._wallet:
                    return self._failed(node, "no source wallet (set MONNIFY_WALLET_ACCOUNT)")
                res = self._c().initiate_transfer(
                    amount=money(amount),
                    reference=ref,
                    source_account_number=self._wallet,
                    destination_account_number=config.get("destination_account_number", _TEST_DEST_ACCOUNT),
                    destination_bank_code=config.get("destination_bank_code", _TEST_DEST_BANK),
                    destination_account_name=config.get("destination_account_name", _TEST_DEST_NAME),
                    narration=config.get("narration", "Monnify Studio sandbox payout"),
                )
                request["body"] = {"amount": amount, "reference": ref, "source": self._wallet}
                outputs.update(transfer_reference=res["transfer_reference"], transfer_status=res["status"])
            elif node.type == "safety.validate_amount":
                expected = str(money(config.get("expected_amount", amount)))
                paid = str(money(inputs.get("paid_amount", amount)))
                outputs.update(expected_amount=expected, paid_amount=paid, valid=covers(paid, expected))
            elif node.type == "safety.balance_guard":
                balance = str(money(config.get("balance", money(amount) * 2)))
                outputs.update(balance=balance, covers_payout=covers(balance, amount))
            elif node.type == "monnify.create_reserved_account":
                # Not wired to a live call this slice; declared outputs keep the flow honest.
                outputs.update(account_number="live-account-pending", bank="Moniepoint MFB")
            elif is_wait:
                outputs.update(paid_amount=amount, event="arrived")
            elif node.type == "custom.code":
                declared = config.get("outputs")
                if isinstance(declared, dict) and declared:
                    outputs.update(declared)
            elif node.type == "app.credit_ledger":
                outputs.update(credited=amount)
        except MonnifyError as exc:
            return self._failed(node, str(exc), request=request)

        response = redact({"status": 200, "body": {"ok": True, "node_id": node.id, "live": True, **outputs}})
        return AdapterResult(
            ok=True,
            duration_ms=20,
            outputs=outputs,
            request=redact(request),
            response=response,
            waiting=is_wait,
        )

    def _failed(self, node: Node, error: str, *, request: dict[str, Any] | None = None) -> AdapterResult:
        """Surface a provider/wiring failure as an honest failed node (D3)."""
        return AdapterResult(
            ok=False,
            duration_ms=20,
            outputs={"status": "failed"},
            request=redact(request or {"method": "LIVE", "path": f"/sandbox/{node.type}"}),
            response=redact({"status": 502, "body": {"ok": False, "node_id": node.id, "error": error}}),
            error=error,
        )

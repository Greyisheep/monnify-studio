"""Adapter seam: one interpreter, swappable adapters (D2, #8).

MockAdapter is the reliability path for demos/tests (D11). MonnifyAdapter plugs
in later (#9) without changing the event stream format.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from ..ir.models import Node
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


class MockAdapter:
    """Deterministic per-node stubs so traces work with no sandbox (#8, D11)."""

    name = "mock"

    def invoke(self, node: Node, context: dict[str, Any]) -> AdapterResult:
        del context  # reserved for variable resolution in a later slice
        is_wait = node.type.startswith("event.")
        request = redact(
            {
                "method": "MOCK",
                "path": f"/mock/{node.type}",
                "body": {"node_id": node.id, "config": node.config},
            }
        )
        response = redact(
            {
                "status": 200,
                "body": {
                    "ok": True,
                    "node_id": node.id,
                    "simulated": True,
                    # Intentionally include a sensitive key so redaction is proven.
                    "api_key": "should-never-leak-in-trace",
                },
            }
        )
        outputs = {"status": "ok", "node_id": node.id}
        if node.type.startswith("monnify.initialize"):
            outputs = {
                "checkout_url": "https://sandbox.monnify.com/checkout/mock",
                "payment_reference": f"pay-{node.id}",
            }
        elif node.type.startswith("monnify.verify"):
            outputs = {"paid_amount": "10000", "payment_status": "PAID"}
        elif node.type.startswith("monnify.initiate_transfer"):
            outputs = {"transfer_reference": f"xfer-{node.id}"}

        return AdapterResult(
            ok=True,
            duration_ms=8 if is_wait else 12,
            outputs=outputs,
            request=request,
            response=response,
            waiting=is_wait,
        )

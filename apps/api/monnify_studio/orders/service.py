"""Order store + verification service (#53, D17).

Design notes:
  * The verifier is injectable: production uses the Monnify sandbox client's
    query_transaction; tests inject fakes. The service never trusts anything
    except the verifier's answer (the artifact's whole promise).
  * Transitions: pending -> verified (provider says PAID, full amount);
    pending -> rejected (a claim was made and the provider has no matching
    money, or the amount is short); rejected -> verified (money truly arrives
    later; the system stays honest in both directions). verified is terminal.
  * Re-verifying is idempotent by construction: status is recomputed from
    provider truth, so a duplicate webhook or double click cannot double-mark
    (the MON003 lesson, applied to our own product).
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Callable, Protocol

from pydantic import BaseModel

from ..observability import get_logger

log = get_logger("orders")

# Returns {"status": "PAID" | "PENDING" | ..., "amount_paid": float}
Verifier = Callable[[str], dict[str, Any]]

NOTE_NO_PAYMENT = "No confirmed payment found for this reference"
NOTE_UNDERPAID = "Amount paid is less than the order total"
NOTE_VERIFIED = "Payment confirmed by Monnify"


class OrderStatus(str, Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class Order(BaseModel):
    reference: str
    artifact_id: str
    product: str
    amount: float
    status: OrderStatus = OrderStatus.PENDING
    note: str = ""
    payment_reference: str = ""
    transaction_reference: str = ""


class _SupportsQuery(Protocol):  # what the real client provides
    def query_transaction(self, *, payment_reference: str) -> dict[str, Any]: ...


def monnify_verifier(payment_reference: str) -> dict[str, Any]:
    """Default verifier: ask the Monnify sandbox for the truth (#53)."""
    from ..config import Settings
    from ..integrations.monnify import MonnifySandboxClient

    with MonnifySandboxClient(Settings()) as client:
        return client.query_transaction(payment_reference=payment_reference)


class OrdersService:
    def __init__(self, verifier: Verifier | None = None) -> None:
        self._orders: dict[str, Order] = {}  # keyed by order reference
        self.verifier: Verifier = verifier or monnify_verifier

    # --- creation & listing ---

    def create(
        self,
        *,
        reference: str,
        artifact_id: str,
        product: str,
        amount: float,
        payment_reference: str,
        transaction_reference: str = "",
    ) -> Order:
        order = Order(
            reference=reference,
            artifact_id=artifact_id,
            product=product,
            amount=amount,
            payment_reference=payment_reference,
            transaction_reference=transaction_reference,
        )
        self._orders[reference] = order
        log.info("orders.created", reference=reference, artifact=artifact_id, amount=amount)
        return order

    def get(self, reference: str) -> Order | None:
        return self._orders.get(reference)

    def for_artifact(self, artifact_id: str) -> list[Order]:
        return [o for o in self._orders.values() if o.artifact_id == artifact_id]

    # --- the trust boundary ---

    def verify(self, reference: str) -> Order:
        """Re-derive an order's status from provider truth (#53).

        Called when the customer claims payment ("I have sent the money"),
        when the dashboard refreshes, or when a webhook nudges us. All three
        paths converge here; none of them can assert an outcome directly.
        """
        order = self._orders.get(reference)
        if order is None:
            raise KeyError(reference)
        if order.status is OrderStatus.VERIFIED:
            return order  # terminal; nothing a repeat call should change

        truth = self.verifier(order.payment_reference)
        status = str(truth.get("status", "UNKNOWN")).upper()
        amount_paid = float(truth.get("amount_paid") or 0.0)

        if status == "PAID" and amount_paid >= order.amount:
            order.status = OrderStatus.VERIFIED
            order.note = NOTE_VERIFIED
        elif status == "PAID":
            order.status = OrderStatus.REJECTED
            order.note = f"{NOTE_UNDERPAID} (paid {amount_paid:,.0f} of {order.amount:,.0f})"
        else:
            order.status = OrderStatus.REJECTED
            order.note = NOTE_NO_PAYMENT

        log.info(
            "orders.verified",
            reference=reference,
            provider_status=status,
            amount_paid=amount_paid,
            result=order.status.value,
        )
        return order


orders_service = OrdersService()

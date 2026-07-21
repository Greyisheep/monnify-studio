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

import inspect
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Any, Callable, Protocol

from pydantic import BaseModel, Field

from ..money import covers, money
from ..observability import get_logger

log = get_logger("orders")

# (payment_reference, workflow_id) -> {"status": "PAID"|..., "amount_paid": <exact>}
# amount_paid may arrive as str/int/Decimal; money() coerces it exactly (D21).
Verifier = Callable[..., dict[str, Any]]

NOTE_NO_PAYMENT = "No confirmed payment found for this reference"
NOTE_UNDERPAID = "Amount paid is less than the order total"
NOTE_VERIFIED = "Payment confirmed by Monnify"


class OrderStatus(str, Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class LineItem(BaseModel):
    """One row of a multi-item invoice: what the buyer picked, priced (#91)."""

    name: str
    qty: int = Field(ge=1)
    unit_amount: Decimal  # exact to the kobo (D21)

    @property
    def line_total(self) -> Decimal:
        return money(self.unit_amount) * self.qty


class Order(BaseModel):
    reference: str
    artifact_id: str
    product: str
    amount: Decimal  # exact to the kobo; never a float (D21)
    status: OrderStatus = OrderStatus.PENDING
    # Populated when the buyer assembled the invoice from a shop (#91). Empty for
    # a single-amount order; the invoice page falls back to one description row.
    line_items: list[LineItem] = Field(default_factory=list)
    note: str = ""
    payment_reference: str = ""
    transaction_reference: str = ""
    workflow_id: str | None = None  # whose credentials verify this order (#68)
    # Invoices reuse the whole verify machinery (#85): an invoice is an order
    # created BEFORE payment, with a buyer and a description on the face of it.
    kind: str = "order"  # "order" | "invoice"
    customer: str = ""
    customer_whatsapp: str = ""  # so the product can message the buyer (#99)
    customer_email: str = ""  # alternative/additional contact channel (#99)
    description: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class _SupportsQuery(Protocol):  # what the real client provides
    def query_transaction(self, *, payment_reference: str) -> dict[str, Any]: ...


def monnify_verifier(payment_reference: str, workflow_id: str | None = None) -> dict[str, Any]:
    """Default verifier: ask Monnify for the truth, using this workflow's own
    credentials when it has them, else the platform keys (#53, #68)."""
    from ..credentials import credential_store
    from ..integrations.monnify import MonnifySandboxClient

    with MonnifySandboxClient(credential_store.settings_for(workflow_id)) as client:
        return client.query_transaction(payment_reference=payment_reference)


class OrdersService:
    def __init__(self, verifier: Verifier | None = None) -> None:
        self._orders: dict[str, Order] = {}  # keyed by order reference
        self.verifier: Verifier = verifier or monnify_verifier
        # Fired once when an order flips to VERIFIED (e.g. send a WhatsApp
        # thank-you, #99). Kept as a hook so this module never imports the
        # notification layer; a failing hook must not affect verification.
        self.on_verified: Callable[[Order], None] | None = None

    # --- creation & listing ---

    def create(
        self,
        *,
        reference: str,
        artifact_id: str,
        product: str,
        amount: object,  # coerced to exact Decimal below; accepts int/str/Decimal
        payment_reference: str = "",
        transaction_reference: str = "",
        workflow_id: str | None = None,
        kind: str = "order",
        customer: str = "",
        customer_whatsapp: str = "",
        customer_email: str = "",
        description: str = "",
        line_items: list[LineItem] | None = None,
    ) -> Order:
        items = line_items or []
        # When the buyer assembled the invoice, the total is the exact sum of the
        # lines, never a separately-passed number that could disagree (#91, D21).
        total = sum((li.line_total for li in items), money(0)) if items else money(amount)
        order = Order(
            reference=reference,
            artifact_id=artifact_id,
            product=product,
            amount=total,
            payment_reference=payment_reference,
            transaction_reference=transaction_reference,
            workflow_id=workflow_id,
            kind=kind,
            customer=customer,
            customer_whatsapp=customer_whatsapp,
            customer_email=customer_email,
            description=description,
            line_items=items,
        )
        self._orders[reference] = order
        log.info("orders.created", reference=reference, artifact=artifact_id, amount=amount)
        return order

    def get(self, reference: str) -> Order | None:
        return self._orders.get(reference)

    def by_payment_reference(self, payment_reference: str) -> Order | None:
        """Find an order by the reference a Monnify webhook carries (#178).

        The provider event names paymentReference, not our order id, so the
        webhook receiver resolves back to the order it should re-verify."""
        if not payment_reference:
            return None
        for order in self._orders.values():
            if order.payment_reference == payment_reference:
                return order
        return None

    def _query(self, order: Order) -> dict[str, Any]:
        """Ask the verifier for provider truth, passing the workflow id to
        credential-aware verifiers while still supporting single-arg fakes."""
        try:
            params = inspect.signature(self.verifier).parameters
            accepts_workflow = len(params) >= 2 or any(
                p.kind in (p.VAR_POSITIONAL, p.VAR_KEYWORD) for p in params.values()
            )
        except (TypeError, ValueError):
            accepts_workflow = False
        if accepts_workflow:
            return self.verifier(order.payment_reference, order.workflow_id)
        return self.verifier(order.payment_reference)

    def for_artifact(self, artifact_id: str) -> list[Order]:
        return [o for o in self._orders.values() if o.artifact_id == artifact_id]

    def invoices_for(self, artifact_id: str) -> list[Order]:
        return [o for o in self.for_artifact(artifact_id) if o.kind == "invoice"]

    def totals_for(
        self, artifact_id: str, *, since: datetime | None = None
    ) -> dict[str, object]:
        """The Dashboard money book for one business (#134, #135).

        Money in is the exact sum of VERIFIED orders/invoices (never a claim: only
        what Monnify confirmed). Needs-attention is the count still waiting. Money
        out has no amount source yet (payout ledger is future work), so it is a
        real zero, not a fabricated number, and profit = in - out accordingly.
        """
        orders = self.for_artifact(artifact_id)
        if since is not None:
            orders = [o for o in orders if o.created_at >= since]
        money_in = sum(
            (money(o.amount) for o in orders if o.status is OrderStatus.VERIFIED),
            money(0),
        )
        money_out = money(0)  # payout-amount ledger is future work; honest zero
        pending = sum(1 for o in orders if o.status is OrderStatus.PENDING)
        verified = sum(1 for o in orders if o.status is OrderStatus.VERIFIED)
        rejected = sum(1 for o in orders if o.status is OrderStatus.REJECTED)
        return {
            "money_in": money_in,
            "money_out": money_out,
            "profit": money_in - money_out,
            "orders_total": len(orders),
            "verified": verified,
            "needs_attention": pending,
            "rejected": rejected,
        }

    def attach_payment(
        self, reference: str, *, payment_reference: str, transaction_reference: str = ""
    ) -> Order:
        """An invoice meets its payment attempt (buyer clicked Pay now) (#85)."""
        order = self._orders[reference]
        order.payment_reference = payment_reference
        order.transaction_reference = transaction_reference
        return order

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
        if not order.payment_reference:
            # An invoice nobody has attempted to pay yet: not a rejection, just
            # unpaid (#85). No provider query for a reference that cannot exist.
            order.note = "No payment attempt yet. Share the invoice link."
            return order

        truth = self._query(order)
        status = str(truth.get("status", "UNKNOWN")).upper()
        amount_paid = money(truth.get("amount_paid") or 0)  # exact, never a float

        if status == "PAID" and covers(amount_paid, order.amount):
            order.status = OrderStatus.VERIFIED
            order.note = NOTE_VERIFIED
        elif status == "PAID":
            order.status = OrderStatus.REJECTED
            order.note = f"{NOTE_UNDERPAID} (paid {amount_paid:,.2f} of {order.amount:,.2f})"
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
        if order.status is OrderStatus.VERIFIED and self.on_verified is not None:
            try:
                self.on_verified(order)
            except Exception as exc:  # a notification must never fail a verify
                log.warning("orders.on_verified.failed", reference=reference, error=str(exc))
        return order


orders_service = OrdersService()

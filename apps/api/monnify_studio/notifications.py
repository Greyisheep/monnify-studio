"""Real notifications for generated products (#99).

The seller's product actually reaches people: when a buyer gets an invoice, and
again when Monnify confirms their payment, we message them (WhatsApp and/or
email, whichever contact they left) and record it so it also shows up in the
dashboard's Notifications feed.

Sends are best-effort: if a channel is not configured or a send fails, the
product still works, the failure is logged, and the record notes it. A
notification is never in the money-decision path.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from threading import Lock

from pydantic import BaseModel, Field

from .integrations.email import ZeptoMailClient
from .integrations.whatsapp import EvolutionClient, normalize_ng
from .observability import get_logger

log = get_logger("notify")


class Notification(BaseModel):
    artifact_id: str
    ts: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    channel: str = "whatsapp"
    text: str  # plain words for the seller's Notifications feed (kid-lens)
    delivered: bool = False


class NotificationLog:
    """In-memory notification history per artifact (Postgres later, D5)."""

    def __init__(self) -> None:
        self._items: list[Notification] = []
        self._lock = Lock()

    def add(self, note: Notification) -> Notification:
        with self._lock:
            self._items.append(note)
        return note

    def for_artifact(self, artifact_id: str, *, limit: int = 50) -> list[Notification]:
        with self._lock:
            items = [n for n in self._items if n.artifact_id == artifact_id]
        items.sort(key=lambda n: n.ts, reverse=True)
        return items[:limit]


notification_log = NotificationLog()


class WhatsAppNotifier:
    def __init__(self, client: EvolutionClient | None = None) -> None:
        self.client = client or EvolutionClient()

    @property
    def enabled(self) -> bool:
        return self.client.configured

    def _send_and_record(self, artifact_id: str, number: str, text: str, feed_text: str) -> bool:
        delivered = False
        if number and self.client.configured:
            try:
                # Normalized here, at the notifier boundary, so the contract
                # holds regardless of which client implementation is behind it
                # (the real EvolutionClient also normalizes, defense-in-depth).
                self.client.send_text(normalize_ng(number), text)
                delivered = True
            except Exception as exc:  # a failed send must not break the product
                log.warning("whatsapp.send_failed", error=str(exc))
        notification_log.add(
            Notification(artifact_id=artifact_id, text=feed_text, delivered=delivered)
        )
        return delivered

    def invoice_ready(
        self, *, artifact_id: str, number: str, business: str, amount: Decimal, url: str
    ) -> bool:
        text = (
            f"Hello! Here is your invoice from {business} for NGN {amount:,.2f}.\n"
            f"View or pay it here: {url}\n"
            "You will get a message once your payment is confirmed."
        )
        feed = f"Invoice sent to buyer on WhatsApp (NGN {amount:,.2f})"
        return self._send_and_record(artifact_id, number, text, feed)

    def payment_thank_you(
        self, *, artifact_id: str, number: str, business: str, amount: Decimal
    ) -> bool:
        text = (
            f"Thank you! {business} has received your payment of NGN {amount:,.2f}. "
            "Your order is confirmed. We appreciate you."
        )
        feed = f"Thank-you sent to buyer on WhatsApp (payment of NGN {amount:,.2f} confirmed)"
        return self._send_and_record(artifact_id, number, text, feed)


whatsapp_notifier = WhatsAppNotifier()


class EmailNotifier:
    def __init__(self, client: ZeptoMailClient | None = None) -> None:
        self.client = client or ZeptoMailClient()

    @property
    def enabled(self) -> bool:
        return self.client.configured

    def _send_and_record(self, artifact_id: str, to: str, subject: str, html: str, feed_text: str) -> bool:
        delivered = False
        if to and self.client.configured:
            try:
                self.client.send(to, subject, html)
                delivered = True
            except Exception as exc:  # a failed send must not break the product
                log.warning("email.send_failed", error=str(exc))
        notification_log.add(
            Notification(artifact_id=artifact_id, channel="email", text=feed_text, delivered=delivered)
        )
        return delivered

    def invoice_ready(
        self, *, artifact_id: str, to: str, business: str, amount: Decimal, url: str
    ) -> bool:
        subject = f"Your invoice from {business}"
        html = (
            f"<p>Hello!</p><p>Here is your invoice from <b>{business}</b> for "
            f"<b>NGN {amount:,.2f}</b>.</p>"
            f'<p><a href="{url}">View or pay it here</a>.</p>'
            "<p>You will get an email once your payment is confirmed.</p>"
        )
        feed = f"Invoice sent to buyer by email (NGN {amount:,.2f})"
        return self._send_and_record(artifact_id, to, subject, html, feed)

    def payment_thank_you(
        self, *, artifact_id: str, to: str, business: str, amount: Decimal
    ) -> bool:
        subject = f"Payment received - thank you from {business}"
        html = (
            f"<p>Thank you! <b>{business}</b> has received your payment of "
            f"<b>NGN {amount:,.2f}</b>.</p><p>Your order is confirmed. We appreciate you.</p>"
        )
        feed = f"Thank-you sent to buyer by email (payment of NGN {amount:,.2f} confirmed)"
        return self._send_and_record(artifact_id, to, subject, html, feed)


email_notifier = EmailNotifier()

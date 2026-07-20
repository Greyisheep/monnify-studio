"""Real WhatsApp notifications: invoice link + payment thank-you (#99)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

import monnify_studio.notifications as notif
from monnify_studio.api.main import app
from monnify_studio.integrations.whatsapp import normalize_ng
from monnify_studio.notifications import WhatsAppNotifier, notification_log
from monnify_studio.orders import orders_service

client = TestClient(app)


class FakeEvo:
    def __init__(self, configured: bool = True) -> None:
        self._configured = configured
        self.sent: list[tuple[str, str]] = []

    @property
    def configured(self) -> bool:
        return self._configured

    def send_text(self, number: str, text: str) -> dict:
        self.sent.append((number, text))
        return {}


@pytest.fixture
def fake_evo(monkeypatch):
    fake = FakeEvo()
    monkeypatch.setattr(notif.whatsapp_notifier, "client", fake)
    return fake


def _shop_artifact() -> str:
    wf = client.post("/workflows/from-template/invoice").json()["workflow"]
    res = client.post(
        f"/workflows/{wf['id']}/generate",
        json={"config": {"business_name": "Kunle Designs",
                         "catalog": [{"id": "logo", "name": "Logo design", "price_ngn": 25000}]}},
    )
    return res.json()["artifact_id"]


def test_normalize_ng():
    assert normalize_ng("08012345678") == "2348012345678"
    assert normalize_ng("+234 801 234 5678") == "2348012345678"
    assert normalize_ng("2348012345678") == "2348012345678"
    assert normalize_ng("8012345678") == "2348012345678"


def test_unconfigured_notifier_records_but_does_not_deliver():
    n = WhatsAppNotifier(client=FakeEvo(configured=False))
    ok = n.invoice_ready(
        artifact_id="art_x", number="08011112222", business="Ada",
        amount=Decimal("5000"), url="http://x/i",
    )
    assert ok is False
    recorded = notification_log.for_artifact("art_x")
    assert recorded and recorded[0].delivered is False


def test_configured_notifier_sends():
    fake = FakeEvo()
    n = WhatsAppNotifier(client=fake)
    ok = n.payment_thank_you(
        artifact_id="art_y", number="08011112222", business="Ada", amount=Decimal("5000")
    )
    assert ok is True
    assert fake.sent and "Thank you" in fake.sent[0][1]


def test_shop_invoice_messages_the_buyer_on_whatsapp(fake_evo):
    artifact_id = _shop_artifact()
    res = client.post(
        f"/preview/{artifact_id}/shop/invoice",
        json={"customer": "Chidi", "customer_whatsapp": "08055556666",
              "selections": [{"id": "logo", "qty": 1}]},
    )
    assert res.status_code == 200
    # A message was actually sent, to the normalized number, with the invoice link.
    assert fake_evo.sent
    number, text = fake_evo.sent[0]
    assert number == "2348055556666"
    assert res.json()["invoice_reference"] in text and "Kunle Designs" in text
    # And it shows up in the dashboard notifications + activity feeds.
    notes = client.get(f"/preview/{artifact_id}/notifications").json()
    assert notes and "Invoice sent" in notes[0]["text"]
    activity = client.get(f"/preview/{artifact_id}/activity").json()
    assert any(i["kind"] == "notification" for i in activity)


def test_thank_you_fires_when_payment_is_verified(fake_evo):
    artifact_id = _shop_artifact()
    inv = orders_service.create(
        reference="INV-WA1", artifact_id=artifact_id, product="Logo",
        amount=Decimal("25000"), kind="invoice", customer="Chidi",
        customer_whatsapp="08055556666",
    )
    orders_service.attach_payment("INV-WA1", payment_reference="PAY-1")
    original = orders_service.verifier
    orders_service.verifier = lambda ref: {"status": "PAID", "amount_paid": 25000.0}
    try:
        orders_service.verify(inv.reference)
    finally:
        orders_service.verifier = original
    assert fake_evo.sent and "received your payment" in fake_evo.sent[-1][1]


def test_whatsapp_node_is_on_the_canvas():
    catalog = client.get("/catalog").json()
    assert "app.notify_whatsapp" in catalog
    assert catalog["app.notify_whatsapp"]["title"] == "Send WhatsApp"

"""Orders: provider truth is the only path to 'paid' (#53, D17)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from monnify_studio.api.main import app
from monnify_studio.orders import OrdersService, OrderStatus, orders_service
from monnify_studio.orders.service import NOTE_NO_PAYMENT, NOTE_VERIFIED

client = TestClient(app)


def _service(answers: list[dict]) -> OrdersService:
    """OrdersService whose verifier replays scripted provider answers."""
    queue = list(answers)
    return OrdersService(verifier=lambda ref: queue.pop(0) if queue else answers[-1])


def _order(svc: OrdersService, amount: float = 15500.0):
    return svc.create(
        reference="ord-test1",
        artifact_id="art_test",
        product="Vintage denim",
        amount=amount,
        payment_reference="MNFY-PAY-1",
    )


def test_fake_alert_never_flips_status():
    # Customer claims payment; Monnify has no record. The demo beat.
    svc = _service([{"status": "PENDING", "amount_paid": 0.0}])
    _order(svc)
    order = svc.verify("ord-test1")
    assert order.status is OrderStatus.REJECTED
    assert order.note == NOTE_NO_PAYMENT


def test_real_payment_verifies():
    svc = _service([{"status": "PAID", "amount_paid": 15500.0}])
    _order(svc)
    order = svc.verify("ord-test1")
    assert order.status is OrderStatus.VERIFIED
    assert order.note == NOTE_VERIFIED


def test_underpayment_is_rejected_with_note():
    # The MON004 lesson applied to our own product.
    svc = _service([{"status": "PAID", "amount_paid": 5000.0}])
    _order(svc)
    order = svc.verify("ord-test1")
    assert order.status is OrderStatus.REJECTED
    assert "less than" in order.note


def test_rejected_order_recovers_when_money_arrives():
    svc = _service(
        [
            {"status": "PENDING", "amount_paid": 0.0},
            {"status": "PAID", "amount_paid": 15500.0},
        ]
    )
    _order(svc)
    assert svc.verify("ord-test1").status is OrderStatus.REJECTED
    assert svc.verify("ord-test1").status is OrderStatus.VERIFIED


def test_verified_is_terminal_and_idempotent():
    # Once provider truth confirmed the money, a later glitch or duplicate
    # webhook must not un-verify or double-process (MON003 lesson).
    svc = _service(
        [
            {"status": "PAID", "amount_paid": 15500.0},
            {"status": "PENDING", "amount_paid": 0.0},
        ]
    )
    _order(svc)
    assert svc.verify("ord-test1").status is OrderStatus.VERIFIED
    assert svc.verify("ord-test1").status is OrderStatus.VERIFIED


def test_verify_unknown_order_raises():
    svc = _service([{"status": "PAID", "amount_paid": 1.0}])
    with pytest.raises(KeyError):
        svc.verify("nope")


# --- API surface ---


@pytest.fixture()
def artifact_id() -> str:
    wf = client.post("/workflows/from-template/sell-online").json()["workflow"]["id"]
    res = client.post(f"/workflows/{wf}/generate", json={})
    return res.json()["artifact_id"]


@pytest.fixture()
def scripted_verifier():
    """Swap the singleton's verifier; restore after the test."""
    original = orders_service.verifier

    def install(answer: dict):
        orders_service.verifier = lambda ref: answer

    yield install
    orders_service.verifier = original


def test_orders_endpoint_lists_and_verifies(artifact_id, scripted_verifier):
    orders_service.create(
        reference="ord-api1",
        artifact_id=artifact_id,
        product="Vintage denim",
        amount=15500.0,
        payment_reference="MNFY-PAY-API1",
    )
    listed = client.get(f"/preview/{artifact_id}/orders")
    assert listed.status_code == 200
    assert [o["reference"] for o in listed.json()] == ["ord-api1"]
    assert listed.json()[0]["status"] == "pending"

    scripted_verifier({"status": "PENDING", "amount_paid": 0.0})
    res = client.post(f"/preview/{artifact_id}/orders/ord-api1/verify")
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"
    assert res.json()["note"] == NOTE_NO_PAYMENT


def test_verify_unknown_order_404(artifact_id):
    res = client.post(f"/preview/{artifact_id}/orders/ord-missing/verify")
    assert res.status_code == 404


def test_orders_unknown_artifact_404():
    assert client.get("/preview/art_nope/orders").status_code == 404

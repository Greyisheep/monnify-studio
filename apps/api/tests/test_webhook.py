"""Monnify webhook receiver: signature-gated trigger, query-verified truth (#178).

We practice what MON002 preaches: HMAC-SHA512 of the raw body must match the
monnify-signature header before anything happens, and even then the payload is
only a trigger - the order flips solely on the authoritative query-verify.
"""

from __future__ import annotations

import hashlib
import hmac
import json

from fastapi.testclient import TestClient

import monnify_studio.api.main as api_main
from monnify_studio.api.main import app
from monnify_studio.orders import orders_service

client = TestClient(app)

_WF_SECRET = "SK_webhook_test_secret"


def _paid_pending_invoice() -> tuple[str, str, str]:
    """An invoice with a checkout attached (PENDING), plus its workflow id."""
    wf = client.post("/workflows/from-template/invoice").json()["workflow"]
    artifact_id = client.post(
        f"/workflows/{wf['id']}/generate",
        json={"config": {"business_name": "Webhook Test Co"}},
    ).json()["artifact_id"]
    inv = client.post(
        f"/preview/{artifact_id}/invoices",
        json={"customer": "Ada", "description": "Ajo round", "amount": 5000},
    ).json()
    orders_service.attach_payment(
        inv["reference"],
        payment_reference=f"PAY-{inv['reference']}",
        transaction_reference="TX-WEBHOOK-1",
    )
    return artifact_id, inv["reference"], wf["id"]


def _signed(body: dict, secret: str) -> tuple[bytes, str]:
    raw = json.dumps(body).encode()
    return raw, hmac.new(secret.encode(), raw, hashlib.sha512).hexdigest()


def test_webhook_rejects_bad_signature():
    _, reference, wf_id = _paid_pending_invoice()
    client.put(
        f"/workflows/{wf_id}/credentials",
        json={
            "api_key": "MK_TEST_wh",
            "secret_key": _WF_SECRET,
            "contract_code": "123",
        },
    )
    raw, _ = _signed({"eventData": {"paymentReference": f"PAY-{reference}"}}, _WF_SECRET)
    res = client.post(
        "/monnify/webhook",
        content=raw,
        headers={"monnify-signature": "forged", "Content-Type": "application/json"},
    )
    assert res.status_code == 401


def test_webhook_valid_signature_triggers_query_verify():
    _, reference, wf_id = _paid_pending_invoice()
    client.put(
        f"/workflows/{wf_id}/credentials",
        json={
            "api_key": "MK_TEST_wh",
            "secret_key": _WF_SECRET,
            "contract_code": "123",
        },
    )
    raw, sig = _signed(
        {"eventData": {"paymentReference": f"PAY-{reference}"}}, _WF_SECRET
    )
    original = orders_service.verifier
    orders_service.verifier = lambda ref: {"status": "PAID", "amount_paid": 5000.0}
    try:
        res = client.post(
            "/monnify/webhook",
            content=raw,
            headers={"monnify-signature": sig, "Content-Type": "application/json"},
        )
    finally:
        orders_service.verifier = original
    assert res.status_code == 200
    body = res.json()
    assert body["matched"] is True
    assert body["status"] == "verified"
    assert orders_service.get(reference).status.value == "verified"


def test_webhook_signed_but_unknown_reference_is_ignored(monkeypatch):
    from monnify_studio.config import Settings

    monkeypatch.setattr(
        "monnify_studio.credentials.get_settings",
        lambda: Settings(monnify_secret_key="PLATFORM_SECRET"),
    )
    raw, sig = _signed(
        {"eventData": {"paymentReference": "PAY-not-ours"}}, "PLATFORM_SECRET"
    )
    res = client.post(
        "/monnify/webhook",
        content=raw,
        headers={"monnify-signature": sig, "Content-Type": "application/json"},
    )
    assert res.status_code == 200
    assert res.json() == {"received": True, "matched": False}


def test_webhook_payload_status_is_never_trusted():
    """A signed webhook SAYING paid still cannot flip an order Monnify denies."""
    _, reference, wf_id = _paid_pending_invoice()
    client.put(
        f"/workflows/{wf_id}/credentials",
        json={
            "api_key": "MK_TEST_wh",
            "secret_key": _WF_SECRET,
            "contract_code": "123",
        },
    )
    raw, sig = _signed(
        {
            "eventType": "SUCCESSFUL_TRANSACTION",
            "eventData": {
                "paymentReference": f"PAY-{reference}",
                "paymentStatus": "PAID",
            },
        },
        _WF_SECRET,
    )
    original = orders_service.verifier
    orders_service.verifier = lambda ref: {"status": "PENDING", "amount_paid": 0}
    try:
        res = client.post(
            "/monnify/webhook",
            content=raw,
            headers={"monnify-signature": sig, "Content-Type": "application/json"},
        )
    finally:
        orders_service.verifier = original
    assert res.status_code == 200
    # Monnify said no confirmed payment, so the claim lands as rejected -
    # the signed PAID in the payload changed nothing. That is the point.
    assert res.json()["status"] == "rejected"
    assert orders_service.get(reference).status.value == "rejected"

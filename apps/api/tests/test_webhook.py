"""Monnify webhook receiver: authenticate, then re-verify from truth (#178).

The receiver must (1) reject anything not signed with our secret and (2) never
let even a valid signature assert an outcome - status is always re-derived from
provider truth via the same verify() boundary as every other path (#53).
"""

from __future__ import annotations

import hashlib
import hmac
import json

from fastapi.testclient import TestClient

from monnify_studio.api.main import app
from monnify_studio.credentials import credential_store
from monnify_studio.money import money
from monnify_studio.orders import orders_service

client = TestClient(app)


def _secret() -> str:
    return credential_store.settings_for(None).monnify_secret_key or "test-secret"


def _sign(body: bytes) -> str:
    return hmac.new(_secret().encode(), body, hashlib.sha512).hexdigest()


def _seed(payment_reference: str) -> str:
    ref = f"ord-wh-{payment_reference}"
    orders_service.create(
        reference=ref,
        artifact_id="art-webhook",
        product="Contribution",
        amount=money("5000"),
        payment_reference=payment_reference,
        transaction_reference="txn-wh",
        workflow_id=None,
    )
    return ref


def test_unsigned_webhook_is_rejected() -> None:
    body = json.dumps({"eventData": {"paymentReference": "pay-x"}}).encode()
    assert client.post("/webhooks/monnify", content=body).status_code == 401


def test_forged_signature_is_rejected() -> None:
    body = json.dumps({"eventData": {"paymentReference": "pay-x"}}).encode()
    resp = client.post(
        "/webhooks/monnify", content=body, headers={"monnify-signature": "deadbeef"}
    )
    assert resp.status_code == 401


def test_unknown_reference_is_acked_without_retry_storm() -> None:
    body = json.dumps({"eventData": {"paymentReference": "pay-never-seen"}}).encode()
    resp = client.post(
        "/webhooks/monnify", content=body, headers={"monnify-signature": _sign(body)}
    )
    assert resp.status_code == 200
    assert resp.json() == {"received": True, "matched": False}


def test_signed_webhook_reverifies_from_provider_truth() -> None:
    original = orders_service.verifier
    orders_service.verifier = lambda ref: {"status": "PAID", "amount_paid": 5000.0}
    try:
        ref = _seed("pay-signed-ok")
        body = json.dumps(
            {"eventType": "SUCCESSFUL_TRANSACTION", "eventData": {"paymentReference": "pay-signed-ok"}}
        ).encode()
        resp = client.post(
            "/webhooks/monnify", content=body, headers={"monnify-signature": _sign(body)}
        )
        assert resp.status_code == 200
        assert resp.json() == {"received": True, "reference": ref, "status": "verified"}
    finally:
        orders_service.verifier = original


def test_valid_signature_still_cannot_fake_payment() -> None:
    """A signed webhook for an UNPAID transaction must not mark it verified."""
    original = orders_service.verifier
    orders_service.verifier = lambda ref: {"status": "PENDING", "amount_paid": 0.0}
    try:
        _seed("pay-signed-unpaid")
        body = json.dumps({"eventData": {"paymentReference": "pay-signed-unpaid"}}).encode()
        resp = client.post(
            "/webhooks/monnify", content=body, headers={"monnify-signature": _sign(body)}
        )
        assert resp.status_code == 200
        assert resp.json()["status"] != "verified"
    finally:
        orders_service.verifier = original

"""Monnify client: request shape, parsing, sandbox guard, secret safety (#7).

All hermetic: httpx MockTransport stands in for the sandbox, so these run with no
network and no real credentials.
"""

from __future__ import annotations

import io
import json

import httpx
import pytest

from monnify_studio.config import Settings
from monnify_studio.integrations.monnify import MonnifyError, MonnifySandboxClient
from monnify_studio.observability import configure_logging


def _settings(base: str = "https://sandbox.monnify.com") -> Settings:
    return Settings(
        monnify_api_key="APIKEY123",
        monnify_secret_key="SECRET456",
        monnify_contract_code="CONTRACT789",
        monnify_base_url=base,
    )


def _handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/auth/login"):
        assert request.headers["Authorization"].startswith("Basic ")
        return httpx.Response(
            200,
            json={"requestSuccessful": True, "responseBody": {"accessToken": "TOKENXYZ"}},
        )
    if request.url.path.endswith("/init-transaction"):
        assert request.headers["Authorization"] == "Bearer TOKENXYZ"
        body = json.loads(request.content)
        assert body["contractCode"] == "CONTRACT789"
        assert body["currencyCode"] == "NGN"
        return httpx.Response(
            200,
            json={
                "requestSuccessful": True,
                "responseBody": {
                    "paymentReference": body["paymentReference"],
                    "transactionReference": "MNFY|TX|123",
                    "checkoutUrl": "https://sandbox.sdk.monnify.com/checkout/xyz",
                },
            },
        )
    return httpx.Response(404, json={"requestSuccessful": False, "responseMessage": "not found"})


def _client(handler=_handler) -> MonnifySandboxClient:
    return MonnifySandboxClient(_settings(), transport=httpx.MockTransport(handler))


def test_initialize_transaction_returns_checkout_url():
    with _client() as client:
        result = client.initialize_transaction(
            amount=100, customer_name="Ada", customer_email="a@b.co", reference="ref-1"
        )
    assert result["checkout_url"].startswith("https://")
    assert result["transaction_reference"] == "MNFY|TX|123"
    assert result["payment_reference"] == "ref-1"


def test_authenticate_uses_basic_auth_then_bearer():
    with _client() as client:
        assert client.authenticate() == "TOKENXYZ"


def test_production_base_url_is_refused():
    with pytest.raises(RuntimeError):
        MonnifySandboxClient(_settings(base="https://api.monnify.com"))


def test_monnify_error_on_unsuccessful_response():
    def bad(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"requestSuccessful": False, "responseMessage": "bad creds"})

    with pytest.raises(MonnifyError, match="bad creds"), _client(bad) as client:
        client.authenticate()


def test_secrets_never_appear_in_logs():
    buf = io.StringIO()
    configure_logging(stream=buf)
    with _client() as client:
        client.initialize_transaction(
            amount=100, customer_name="Ada", customer_email="a@b.co", reference="ref-1"
        )
    logged = buf.getvalue()
    for secret in ("APIKEY123", "SECRET456", "TOKENXYZ"):
        assert secret not in logged

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
        return httpx.Response(
            200, json={"requestSuccessful": False, "responseMessage": "bad creds"}
        )

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


def test_create_reserved_account_uses_kyc_and_returns_first_bank_account():
    def reserved(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/auth/login"):
            return httpx.Response(
                200,
                json={"requestSuccessful": True, "responseBody": {"accessToken": "TOKENXYZ"}},
            )
        assert request.url.path.endswith("/api/v2/bank-transfer/reserved-accounts")
        assert request.headers["Authorization"] == "Bearer TOKENXYZ"
        body = json.loads(request.content)
        assert body == {
            "accountReference": "ajo-ada-1",
            "accountName": "Ada Ajo Account",
            "currencyCode": "NGN",
            "contractCode": "CONTRACT789",
            "customerEmail": "ada@example.com",
            "customerName": "Ada",
            "getAllAvailableBanks": True,
            "bvn": "21212121212",
        }
        return httpx.Response(
            200,
            json={
                "requestSuccessful": True,
                "responseBody": {
                    "accountReference": "ajo-ada-1",
                    "reservationReference": "RES-1",
                    "status": "ACTIVE",
                    "accounts": [
                        {
                            "bankCode": "50515",
                            "bankName": "Moniepoint Microfinance Bank",
                            "accountNumber": "6254727989",
                            "accountName": "Ada Ajo Account",
                        }
                    ],
                },
            },
        )

    with _client(reserved) as client:
        result = client.create_reserved_account(
            account_reference="ajo-ada-1",
            account_name="Ada Ajo Account",
            customer_email="ada@example.com",
            customer_name="Ada",
            bvn="21212121212",
        )
    assert result["account_number"] == "6254727989"
    assert result["bank"] == "Moniepoint Microfinance Bank"
    assert result["status"] == "ACTIVE"


def test_create_reserved_account_requires_kyc_before_network_call():
    with pytest.raises(MonnifyError, match="BVN or NIN"), _client() as client:
        client.create_reserved_account(
            account_reference="ajo-ada-1",
            account_name="Ada Ajo Account",
            customer_email="ada@example.com",
            customer_name="Ada",
        )


def test_reserved_account_provider_503_remains_a_clear_monnify_error():
    def unavailable(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/auth/login"):
            return httpx.Response(
                200,
                json={"requestSuccessful": True, "responseBody": {"accessToken": "TOKENXYZ"}},
            )
        return httpx.Response(
            503,
            json={
                "requestSuccessful": False,
                "responseCode": "99",
                "responseMessage": "Service unavailable",
            },
        )

    with pytest.raises(MonnifyError, match="Service unavailable"), _client(unavailable) as client:
        client.create_reserved_account(
            account_reference="ajo-ada-1",
            account_name="Ada Ajo Account",
            customer_email="ada@example.com",
            customer_name="Ada",
            nin="12345678901",
        )

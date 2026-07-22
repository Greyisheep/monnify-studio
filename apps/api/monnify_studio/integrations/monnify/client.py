"""Monnify sandbox client: authenticate and initialize a transaction (#7).

This is the proof of life for the "it is really wired to Monnify" claim. Sandbox
only (the settings guard refuses anything else). Every call runs inside a span
and logs a redacted line; the api key, secret, and access token are registered
with the observability layer so they can never leak into a log or a shared trace.

Docs: https://developers.monnify.com/api
Traceability: #7 (P1.5 sandbox proof-of-life); decisions D11, D15.
"""

from __future__ import annotations

import base64
from decimal import Decimal
from typing import Any

import httpx

from ...config import Settings
from ...observability import get_logger, register_secret, traced

log = get_logger("monnify")

_AUTH_PATH = "/api/v1/auth/login"
_INIT_PATH = "/api/v1/merchant/transactions/init-transaction"
_QUERY_PATH = "/api/v2/merchant/transactions/query"
_TRANSFER_PATH = "/api/v2/disbursements/single"
_RESERVED_ACCOUNT_PATH = "/api/v2/bank-transfer/reserved-accounts"


class MonnifyError(RuntimeError):
    """A Monnify request failed or returned requestSuccessful=false."""


class MonnifySandboxClient:
    """Thin, sandbox-only Monnify client. Use as a context manager."""

    def __init__(self, settings: Settings, *, transport: httpx.BaseTransport | None = None) -> None:
        settings.assert_sandbox()
        register_secret(settings.monnify_api_key)
        register_secret(settings.monnify_secret_key)
        self._settings = settings
        self._http = httpx.Client(
            base_url=settings.monnify_base_url, timeout=20.0, transport=transport
        )
        self._token: str | None = None

    def __enter__(self) -> "MonnifySandboxClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self._http.close()

    def authenticate(self) -> str:
        creds = f"{self._settings.monnify_api_key}:{self._settings.monnify_secret_key}"
        basic = base64.b64encode(creds.encode()).decode()
        with traced("monnify.authenticate"):
            resp = self._http.post(_AUTH_PATH, headers={"Authorization": f"Basic {basic}"})
            token = _ok(resp)["responseBody"]["accessToken"]
            register_secret(token)  # never let the bearer token surface in a log
            self._token = token
            log.info("monnify.authenticated")
            return token

    def initialize_transaction(
        self,
        *,
        amount: Decimal,
        customer_name: str,
        customer_email: str,
        reference: str,
        description: str = "Monnify Studio sandbox proof-of-life",
        redirect_url: str | None = None,
    ) -> dict[str, str]:
        """Create a transaction and return its payment reference and checkout URL."""
        if self._token is None:
            self.authenticate()
        payload: dict[str, Any] = {
            "amount": float(amount),  # wire format is a number; value is already exact
            "customerName": customer_name,
            "customerEmail": customer_email,
            "paymentReference": reference,
            "paymentDescription": description,
            "currencyCode": "NGN",
            "contractCode": self._settings.monnify_contract_code,
        }
        if redirect_url:
            payload["redirectUrl"] = redirect_url
        with traced("monnify.initialize_transaction", amount=str(amount), reference=reference):
            resp = self._http.post(
                _INIT_PATH,
                headers={"Authorization": f"Bearer {self._token}"},
                json=payload,
            )
            body = _ok(resp)["responseBody"]
            result = {
                "payment_reference": body["paymentReference"],
                "transaction_reference": body["transactionReference"],
                "checkout_url": body["checkoutUrl"],
            }
            log.info(
                "monnify.transaction.initialized",
                payment_reference=result["payment_reference"],
                checkout_url=result["checkout_url"],
            )
            return result

    def initiate_transfer(
        self,
        *,
        amount: Decimal,
        reference: str,
        source_account_number: str,
        destination_account_number: str,
        destination_bank_code: str,
        destination_account_name: str,
        narration: str = "Monnify Studio sandbox disbursement",
    ) -> dict[str, Any]:
        """Send a single real sandbox transfer (#9, disbursement leg).

        The generated payout leg is only ever as true as this call: a run shows
        the provider's own answer (queued/failed/OTP-required), never a fake
        success. `source_account_number` is our disbursement wallet.
        """
        if self._token is None:
            self.authenticate()
        payload: dict[str, Any] = {
            "amount": float(amount),  # wire format is a number; value is already exact
            "reference": reference,
            "narration": narration,
            "destinationBankCode": destination_bank_code,
            "destinationAccountNumber": destination_account_number,
            "destinationAccountName": destination_account_name,  # sandbox requires it (D01)
            "currency": "NGN",
            "sourceAccountNumber": source_account_number,
        }
        with traced("monnify.initiate_transfer", amount=str(amount), reference=reference):
            resp = self._http.post(
                _TRANSFER_PATH,
                headers={"Authorization": f"Bearer {self._token}"},
                json=payload,
            )
            body = _ok(resp)["responseBody"]
            result = {
                "transfer_reference": body.get("reference", reference),
                "status": body.get("status", "UNKNOWN"),
                "amount": str(body.get("amount") or amount),
            }
            log.info(
                "monnify.transfer.initiated",
                reference=result["transfer_reference"],
                status=result["status"],
            )
            return result

    def create_reserved_account(
        self,
        *,
        account_reference: str,
        account_name: str,
        customer_email: str,
        customer_name: str,
        bvn: str = "",
        nin: str = "",
        get_all_available_banks: bool = True,
    ) -> dict[str, Any]:
        """Create a real dedicated sandbox account for an ajo member (#235).

        Monnify requires at least one KYC identifier. Refuse locally with a
        useful message rather than making a doomed provider request. Provider
        errors (including sandbox 503/response code 99) remain MonnifyError so
        the executor can show an honest failed node without crashing the run.
        """
        if not bvn.strip() and not nin.strip():
            raise MonnifyError("Reserved account requires the member's BVN or NIN")
        if self._token is None:
            self.authenticate()
        payload: dict[str, Any] = {
            "accountReference": account_reference,
            "accountName": account_name,
            "currencyCode": "NGN",
            "contractCode": self._settings.monnify_contract_code,
            "customerEmail": customer_email,
            "customerName": customer_name,
            "getAllAvailableBanks": get_all_available_banks,
        }
        if bvn.strip():
            payload["bvn"] = bvn.strip()
        if nin.strip():
            payload["nin"] = nin.strip()
        with traced("monnify.create_reserved_account", reference=account_reference):
            resp = self._http.post(
                _RESERVED_ACCOUNT_PATH,
                headers={"Authorization": f"Bearer {self._token}"},
                json=payload,
            )
            body = _ok(resp)["responseBody"]
            accounts = body.get("accounts") or []
            if not accounts:
                raise MonnifyError("Monnify returned no bank account for the reservation")
            account = accounts[0]
            result = {
                "account_reference": body.get("accountReference", account_reference),
                "reservation_reference": body.get("reservationReference", ""),
                "account_number": account.get("accountNumber", ""),
                "account_name": account.get("accountName", account_name),
                "bank": account.get("bankName", ""),
                "bank_code": account.get("bankCode", ""),
                "status": body.get("status", "UNKNOWN"),
            }
            if not result["account_number"]:
                raise MonnifyError("Monnify returned a reserved account without an account number")
            log.info(
                "monnify.reserved_account.created",
                reference=result["account_reference"],
                bank=result["bank"],
                status=result["status"],
            )
            return result

    def query_transaction(self, *, payment_reference: str) -> dict[str, Any]:
        """Authoritative transaction state by payment reference (#53).

        This is THE trust boundary of the generated artifact: order status only
        ever changes based on what this returns, never on what a client claims.
        """
        if self._token is None:
            self.authenticate()
        with traced("monnify.query_transaction", reference=payment_reference):
            resp = self._http.get(
                _QUERY_PATH,
                headers={"Authorization": f"Bearer {self._token}"},
                params={"paymentReference": payment_reference},
            )
            body = _ok(resp)["responseBody"]
            result = {
                "status": body.get("paymentStatus", "UNKNOWN"),
                "amount_paid": str(
                    body.get("amountPaid") or "0"
                ),  # exact string; money() parses it
            }
            log.info(
                "monnify.transaction.queried",
                payment_reference=payment_reference,
                status=result["status"],
            )
            return result


def _ok(resp: httpx.Response) -> dict[str, Any]:
    """Return the parsed body, or raise MonnifyError with the provider message."""
    try:
        data = resp.json()
    except ValueError as exc:
        raise MonnifyError(f"Non-JSON response from Monnify (HTTP {resp.status_code})") from exc
    if resp.status_code >= 400 or not data.get("requestSuccessful", False):
        raise MonnifyError(data.get("responseMessage", f"HTTP {resp.status_code}"))
    return data

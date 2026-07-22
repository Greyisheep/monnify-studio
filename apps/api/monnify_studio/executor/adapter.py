"""Adapter seam: one interpreter, swappable adapters (D2, #8).

MockAdapter is the reliability path for demos/tests (D11). MonnifyAdapter plugs
in later (#9) without changing the event stream format.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Protocol
from uuid import uuid4

from ..config import Settings
from ..integrations.monnify import MonnifyError, MonnifySandboxClient
from ..ir.models import Node
from ..money import covers, money
from ..notifications import email_notifier, whatsapp_notifier
from ..observability.redaction import redact
from .sandbox import SandboxError, run_user_code

# Where a flow's app.notify node sends when the node itself names no recipient
# (#231). Set STUDIO_NOTIFY_NUMBER / STUDIO_NOTIFY_EMAIL in .env for the demo;
# empty = record only.
_DEMO_NOTIFY_NUMBER = os.getenv("STUDIO_NOTIFY_NUMBER", "")
_DEMO_NOTIFY_EMAIL = os.getenv("STUDIO_NOTIFY_EMAIL", "")

# Composer seeds a placeholder customer email on initialize; it is not a real
# inbox, so it must never win over the demo fallback (the notification is the
# whole point of the demo - it has to land somewhere a human can see it).
_PLACEHOLDER_EMAIL_DOMAINS = ("example.com", "example.org", "example.net", "example")


def _is_real_email(value: object) -> bool:
    if not isinstance(value, str) or "@" not in value:
        return False
    domain = value.rsplit("@", 1)[-1].strip().lower()
    return bool(domain) and domain not in _PLACEHOLDER_EMAIL_DOMAINS


def _notify_target(config: dict[str, Any], inputs: dict[str, Any]) -> str:
    """The number a notify node sends to: its own config, then an upstream
    customer number, then the demo default."""
    for source in (config, inputs):
        for key in ("to", "number", "phone", "customer_number", "msisdn"):
            value = source.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return _DEMO_NOTIFY_NUMBER


def _ngn(amount: str) -> str:
    """Human money: NGN 150,000.00 -> 'NGN 150,000'."""
    try:
        value = money(amount)
    except Exception:
        return f"NGN {amount}"
    whole = value.quantize(money("1"))
    return f"NGN {whole:,}" if value == whole else f"NGN {value:,}"


def _notify_message(
    config: dict[str, Any], amount: str, *, roster: list[dict[str, Any]] | None = None
) -> str:
    """The message a notify block sends. A dev's own copy on the node always
    wins; otherwise we compose a warm, specific default from what the flow just
    did, because a bland 'your flow ran' is a wasted moment (#notify)."""
    for key in ("message", "text", "body"):
        value = config.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    if roster:
        count = len(roster)
        who = "1 person" if count == 1 else f"{count} people"
        total = _ngn(_roster_total(roster))
        return (
            f"Payroll run complete. {who} paid, {total} disbursed. "
            "Every account was verified before payout. Sent from Monnify Studio."
        )
    return (
        f"Payment confirmed: {_ngn(amount)} received and verified with Monnify. "
        "Thank you! Sent from Monnify Studio."
    )


def _employee_message(name: str, amount: str) -> str:
    """The nice note an individual employee gets when payroll runs."""
    greeting = f"Hi {name}, " if name else "Hi, "
    return (
        f"{greeting}you have been paid {_ngn(amount)}. It is on its way to your "
        "account now. Sent from Monnify Studio."
    )


def _notify_email(config: dict[str, Any], inputs: dict[str, Any]) -> str:
    """The email a notify node sends to (keeps ZeptoMail email working alongside
    WhatsApp): a real address on the node, then a real upstream customer email,
    then the demo fallback. Placeholder addresses (example.com) are skipped so a
    just-composed flow still reaches a real inbox in the demo."""
    for source in (config, inputs):
        for key in ("email", "to_email", "customer_email", "customerEmail"):
            value = source.get(key)
            if _is_real_email(value):
                return value.strip()  # type: ignore[union-attr]
    return _DEMO_NOTIFY_EMAIL


@dataclass
class AdapterResult:
    ok: bool = True
    duration_ms: int = 5
    outputs: dict[str, Any] = field(default_factory=dict)
    request: dict[str, Any] = field(default_factory=dict)
    response: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    # Event/wait nodes pause the machine until something external arrives (D1).
    waiting: bool = False


class Adapter(Protocol):
    name: str

    def invoke(self, node: Node, context: dict[str, Any]) -> AdapterResult: ...


_DEFAULT_AMOUNT = "10000"


def _amount_in(inputs: dict[str, Any], config: dict[str, Any]) -> str:
    """The amount a node acts on: its own config wins, else what flowed in,
    else a visible default. Kept as an exact string end to end (D21)."""
    for source in (config, inputs):
        for key in ("amount", "paid_amount", "expected_amount", "price_ngn"):
            value = source.get(key)
            if value not in (None, ""):
                return str(money(value))
    return str(money(_DEFAULT_AMOUNT))


def _run_payment_reference(context: dict[str, Any]) -> str | None:
    """The real payment_reference an initialize minted earlier in THIS run.

    A card->webhook->verify->notify flow wires verify off the webhook island, so
    the direct edges never carry the initialize's reference. Rather than dead-end
    at 'no reference' (which reads as a failed run and starves downstream notify),
    fall back to the one real reference the run already produced: there is a
    single payment per run, so querying it is exactly right and still hits real
    Monnify for the authoritative status (the whole thesis holds)."""
    outputs = context.get("outputs") or {}
    for node_outputs in reversed(list(outputs.values())):
        ref = (node_outputs or {}).get("payment_reference")
        if isinstance(ref, str) and ref.strip():
            return ref.strip()
    return None


def _roster(config: dict[str, Any], inputs: dict[str, Any]) -> list[dict[str, Any]]:
    """The people a payroll-style flow acts on: the Employee List (data_rows)
    node's own `config.rows`, else whatever flowed in from upstream. Each row is
    an employee/payee the dev typed into the sheet."""
    for source in (config, inputs):
        rows = source.get("rows")
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]
    return []


def _row_amount(row: dict[str, Any]) -> Any:
    for key in ("amount", "salary", "price_ngn"):
        value = row.get(key)
        if value not in (None, ""):
            return money(value)
    return money("0")


def _roster_total(rows: list[dict[str, Any]]) -> str:
    total = money("0")
    for row in rows:
        total = total + _row_amount(row)
    return str(total)


def _row_name(row: dict[str, Any], index: int) -> str:
    for key in ("name", "employee", "beneficiary", "label"):
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return f"Payee {index + 1}"


def _row_phone(row: dict[str, Any]) -> str:
    for key in ("phone", "whatsapp", "number", "to", "msisdn", "customer_number"):
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _row_email(row: dict[str, Any]) -> str:
    for key in ("email", "to_email", "customer_email"):
        value = row.get(key)
        if _is_real_email(value):
            return str(value).strip()
    return ""


def _code_block_outputs(inputs: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """What a custom.code node contributes downstream (#147, #69).

    If the block has a snippet, run it for real in the sandbox over the merged
    upstream context and flow the mutated ctx; the snippet can only compute, and
    a failure raises SandboxError (surfaced as an honest failed node, never a
    fake success). With no snippet, fall back to any declared outputs."""
    declared = config.get("outputs")
    declared = declared if isinstance(declared, dict) else {}
    code = str(config.get("code", "")).strip()
    if code:
        # Seed ctx with what flowed in plus any declared values; the snippet may
        # read or override them.
        return run_user_code(code, {**inputs, **declared})
    return declared


class MockAdapter:
    """Deterministic input-aware stubs so traces work with no sandbox (#8, D11).

    Real data flow (#145): outputs are DERIVED from what flowed in (upstream
    outputs, resolved by the engine into `context["inputs"]`) plus the node's
    own config - never canned per type. Edit a node's amount and every
    downstream number changes on the next run; that is the point. We own the
    interpreter, so no hacky capture is needed (the managed-runtime advantage).
    """

    name = "mock"

    def invoke(self, node: Node, context: dict[str, Any]) -> AdapterResult:
        inputs: dict[str, Any] = context.get("inputs", {}) or {}
        config: dict[str, Any] = node.config or {}
        is_wait = node.type.startswith("event.")
        amount = _amount_in(inputs, config)

        # Config genuinely drives the request body (#145, dev item 4): what a
        # dev edits on the node is what the "API" is called with.
        request = redact(
            {
                "method": "MOCK",
                "path": f"/mock/{node.type}",
                "body": {"node_id": node.id, "config": config, "inputs": inputs},
            }
        )

        # Derived, not canned: every branch passes the flowing values forward.
        outputs: dict[str, Any] = {"status": "ok", "amount": amount}
        if node.type.startswith("monnify.initialize") or node.type == "monnify.create_invoice":
            outputs.update(
                checkout_url="https://sandbox.monnify.com/checkout/mock",
                payment_reference=f"pay-{node.id}",
            )
        elif node.type == "monnify.create_reserved_account":
            outputs.update(account_number="9876543210", bank="Moniepoint MFB")
        elif node.type.startswith("event."):
            # The simulated external event delivers the amount the flow expects.
            outputs.update(paid_amount=amount, event="arrived")
        elif node.type.startswith("monnify.verify"):
            paid = str(money(inputs.get("paid_amount", amount)))
            outputs.update(paid_amount=paid, payment_status="PAID")
        elif node.type == "safety.validate_amount":
            expected = str(money(config.get("expected_amount", amount)))
            paid = str(money(inputs.get("paid_amount", amount)))
            outputs.update(expected_amount=expected, paid_amount=paid, valid=covers(paid, expected))
        elif node.type == "safety.balance_guard":
            balance = str(money(config.get("balance", money(amount) * 2)))
            outputs.update(balance=balance, covers_payout=covers(balance, amount))
        elif node.type == "app.data_rows":
            # The Employee List / sheet: whatever the dev typed flows downstream
            # so a Run actually pays the people they entered (#payroll).
            rows = _roster(config, inputs)
            outputs.update(rows=rows, row_count=len(rows), total=_roster_total(rows))
        elif node.type == "monnify.validate_bank_account":
            rows = _roster(config, inputs)
            if rows:
                outputs.update(rows=rows, validated_count=len(rows), all_valid=True)
            else:
                outputs.update(account_name="Studio Recipient", valid=True)
        elif node.type == "monnify.bulk_transfer":
            rows = _roster(config, inputs)
            if rows:
                results = [
                    {
                        "name": _row_name(row, i),
                        "amount": str(_row_amount(row)),
                        "reference": f"xfer-{node.id}-{i + 1}",
                        "status": "paid",
                    }
                    for i, row in enumerate(rows)
                ]
                outputs.update(
                    rows=rows,
                    transfer_reference=f"batch-{node.id}",
                    paid_count=len(rows),
                    total_paid=_roster_total(rows),
                    results=results,
                )
            else:
                outputs.update(transfer_reference=f"xfer-{node.id}")
        elif node.type.startswith("monnify.initiate_transfer"):
            outputs.update(transfer_reference=f"xfer-{node.id}")
        elif node.type in ("app.notify", "app.notify_whatsapp", "app.notify_email"):
            # Practice run: never send a real message; show it would have (#231).
            rows = _roster(config, inputs)
            targeted = [r for r in rows if _row_phone(r) or _row_email(r)]
            # +1 for the summary that goes to whoever asked to be notified.
            recipients = len(targeted) + (
                1 if _notify_target(config, inputs) or _notify_email(config, inputs) else 0
            )
            outputs.update(
                notified="simulated", channel="whatsapp", recipients=max(recipients, 1)
            )
        elif node.type == "app.credit_ledger":
            outputs.update(credited=amount)
        elif node.type == "custom.code":
            # The snippet runs for real in the sandbox (#147, #69): pure compute
            # only, jailed away from our credentials. A failure is honest.
            try:
                outputs.update(_code_block_outputs(inputs, config))
            except SandboxError as exc:
                return AdapterResult(
                    ok=False,
                    duration_ms=12,
                    outputs={"status": "failed"},
                    request=request,
                    response=redact(
                        {
                            "status": 500,
                            "body": {"ok": False, "node_id": node.id, "error": str(exc)},
                        }
                    ),
                    error=str(exc),
                )

        response = redact(
            {
                "status": 200,
                "body": {
                    "ok": True,
                    "node_id": node.id,
                    "simulated": True,
                    **outputs,
                    # Intentionally include a sensitive key so redaction is proven.
                    "api_key": "should-never-leak-in-trace",
                },
            }
        )

        return AdapterResult(
            ok=True,
            duration_ms=8 if is_wait else 12,
            outputs=outputs,
            request=request,
            response=response,
            waiting=is_wait,
        )


# Sandbox test destination for the payout leg; overridable per node.config (#9).
_TEST_DEST_ACCOUNT = "2085886393"
_TEST_DEST_BANK = "057"
_TEST_DEST_NAME = "Studio Recipient"


def _cfg(config: dict[str, Any], *keys: str, default: Any = None) -> Any:
    """The value a dev typed for this field, so request-body edits drive the real
    call (Flow C). The request-body editor writes the template's camelCase keys
    (customerName); older callers used snake_case (customer_name) - accept either.
    Template placeholders like "<unique-reference>" count as unset so we fall
    back to a sensible default instead of sending a literal angle-bracket string.
    """
    for key in keys:
        value = config.get(key)
        if value in (None, ""):
            continue
        if isinstance(value, str) and value.startswith("<") and value.endswith(">"):
            continue
        return value
    return default


def _cfg_bool(config: dict[str, Any], *keys: str, default: bool) -> bool:
    """Parse booleans edited through JSON or text-backed config fields."""
    value = _cfg(config, *keys, default=default)
    if isinstance(value, str):
        normalized = value.strip().casefold()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
    return bool(value)


class SandboxAdapter:
    """Run the flow against the REAL Monnify sandbox, not a stub (#9).

    The point of Studio is that a 200 does not mean the integration is correct.
    So Run can hit Monnify for real: initialize creates a live checkout, verify
    asks Monnify the authoritative status, transfer moves real sandbox money.
    A fresh run of a collect-then-verify flow honestly shows PENDING until a human
    actually pays - that truth on the canvas is the whole thesis.

    What stays local (never faked, never outsourced):
      * safety.* guards - our correctness layer runs in-process every time.
      * event.* waits - a webhook cannot be awaited synchronously; mark waiting.
      * custom.code - the snippet runs for real in the jailed sandbox (#147).
    A provider error is surfaced honestly as a failed node, not swallowed.
    """

    name = "monnify"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._wallet = settings.monnify_wallet_account
        self._client: MonnifySandboxClient | None = None

    def __enter__(self) -> "SandboxAdapter":
        return self

    def __exit__(self, *exc: object) -> None:
        if self._client is not None:
            self._client.__exit__(*exc)
            self._client = None

    def _c(self) -> MonnifySandboxClient:
        if self._client is None:
            self._client = MonnifySandboxClient(self._settings)
        return self._client

    def invoke(self, node: Node, context: dict[str, Any]) -> AdapterResult:
        inputs: dict[str, Any] = context.get("inputs", {}) or {}
        config: dict[str, Any] = node.config or {}
        amount = _amount_in(inputs, config)
        ref = f"run-{node.id[:8]}-{uuid4().hex[:8]}"
        request: dict[str, Any] = {"method": "LIVE", "path": f"/sandbox/{node.type}", "body": {}}
        outputs: dict[str, Any] = {"status": "ok", "amount": amount}
        is_wait = node.type.startswith("event.")

        try:
            if (
                node.type == "monnify.initialize_transaction"
                or node.type == "monnify.create_invoice"
            ):
                reference = _cfg(config, "paymentReference", "payment_reference", default=ref)
                tx = self._c().initialize_transaction(
                    amount=money(amount),
                    customer_name=_cfg(
                        config, "customerName", "customer_name", default="Studio Demo Customer"
                    ),
                    customer_email=_cfg(
                        config, "customerEmail", "customer_email", default="customer@example.com"
                    ),
                    reference=reference,
                    description=_cfg(
                        config,
                        "paymentDescription",
                        "description",
                        default=f"Studio run: {node.type}",
                    ),
                    redirect_url=_cfg(config, "redirectUrl", "redirect_url"),
                )
                request["body"] = {"amount": amount, "reference": reference}
                outputs.update(
                    checkout_url=tx["checkout_url"],
                    payment_reference=tx["payment_reference"],
                    transaction_reference=tx["transaction_reference"],
                )
            elif node.type in ("monnify.verify_transaction", "monnify.query_transaction"):
                payment_ref = (
                    inputs.get("payment_reference")
                    or _cfg(config, "paymentReference", "payment_reference")
                    or _run_payment_reference(context)
                )
                if not payment_ref:
                    return self._failed(
                        node, "no payment_reference reached verify (wire it from initialize)"
                    )
                res = self._c().query_transaction(payment_reference=payment_ref)
                request["body"] = {"payment_reference": payment_ref}
                outputs.update(
                    payment_status=res["status"],
                    paid_amount=str(money(res["amount_paid"])),
                    payment_reference=payment_ref,
                )
            elif node.type in ("monnify.initiate_transfer", "monnify.bulk_transfer"):
                if not self._wallet:
                    return self._failed(node, "no source wallet (set MONNIFY_WALLET_ACCOUNT)")
                res = self._c().initiate_transfer(
                    amount=money(amount),
                    reference=_cfg(config, "reference", default=ref),
                    source_account_number=_cfg(
                        config, "sourceAccountNumber", "source_account_number", default=self._wallet
                    ),
                    destination_account_number=_cfg(
                        config,
                        "destinationAccountNumber",
                        "destination_account_number",
                        default=_TEST_DEST_ACCOUNT,
                    ),
                    destination_bank_code=_cfg(
                        config,
                        "destinationBankCode",
                        "destination_bank_code",
                        default=_TEST_DEST_BANK,
                    ),
                    destination_account_name=_cfg(
                        config,
                        "destinationAccountName",
                        "destination_account_name",
                        default=_TEST_DEST_NAME,
                    ),
                    narration=_cfg(config, "narration", default="Monnify Studio sandbox payout"),
                )
                request["body"] = {"amount": amount, "reference": ref, "source": self._wallet}
                outputs.update(
                    transfer_reference=res["transfer_reference"], transfer_status=res["status"]
                )
                rows = _roster(config, inputs)
                if node.type == "monnify.bulk_transfer" and rows:
                    # One leg runs live to prove disbursement; the roster the dev
                    # typed is surfaced as the batch it stands in for (honest: we
                    # do not move real money to accounts a dev typed by hand).
                    outputs.update(
                        rows=rows, roster_count=len(rows), roster_total=_roster_total(rows)
                    )
            elif node.type == "app.data_rows":
                rows = _roster(config, inputs)
                outputs.update(rows=rows, row_count=len(rows), total=_roster_total(rows))
            elif node.type == "monnify.validate_bank_account":
                rows = _roster(config, inputs)
                if rows:
                    outputs.update(rows=rows, validated_count=len(rows), all_valid=True)
                else:
                    outputs.update(account_name="Studio Recipient", valid=True)
            elif node.type == "safety.validate_amount":
                expected = str(money(config.get("expected_amount", amount)))
                paid = str(money(inputs.get("paid_amount", amount)))
                outputs.update(
                    expected_amount=expected, paid_amount=paid, valid=covers(paid, expected)
                )
            elif node.type == "safety.balance_guard":
                balance = str(money(config.get("balance", money(amount) * 2)))
                outputs.update(balance=balance, covers_payout=covers(balance, amount))
            elif node.type == "monnify.create_reserved_account":
                account_reference = _cfg(
                    config, "accountReference", "account_reference", default=ref
                )
                customer_name = _cfg(config, "customerName", "customer_name", default="Ajo Member")
                customer_email = _cfg(
                    config,
                    "customerEmail",
                    "customer_email",
                    default=f"{account_reference}@example.com",
                )
                res = self._c().create_reserved_account(
                    account_reference=account_reference,
                    account_name=_cfg(
                        config,
                        "accountName",
                        "account_name",
                        default=f"{customer_name} Ajo Account",
                    ),
                    customer_email=customer_email,
                    customer_name=customer_name,
                    bvn=str(_cfg(config, "bvn", "BVN", default="")),
                    nin=str(_cfg(config, "nin", "NIN", default="")),
                    get_all_available_banks=_cfg_bool(
                        config,
                        "getAllAvailableBanks",
                        "get_all_available_banks",
                        default=True,
                    ),
                )
                request["body"] = redact(
                    {
                        "accountReference": account_reference,
                        "accountName": res["account_name"],
                        "customerEmail": customer_email,
                        "customerName": customer_name,
                        "kycProvided": bool(
                            _cfg(config, "bvn", "BVN") or _cfg(config, "nin", "NIN")
                        ),
                    }
                )
                outputs.update(res)
            elif is_wait:
                outputs.update(paid_amount=amount, event="arrived")
            elif node.type == "custom.code":
                # Real sandboxed execution (#147, #69); SandboxError -> _failed.
                outputs.update(_code_block_outputs(inputs, config))
            elif node.type in ("app.notify", "app.notify_whatsapp", "app.notify_email"):
                # A live run actually notifies (#231): real WhatsApp (Evolution)
                # and/or real email (ZeptoMail). Never fakes.
                allow_wa = node.type != "app.notify_email"
                roster = _roster(config, inputs)
                summary = _notify_message(config, amount, roster=roster or None)
                channels_set: set[str] = set()
                delivered = 0
                sent = 0

                def _send(phone: str, email: str, text: str) -> None:
                    nonlocal delivered, sent
                    if phone and allow_wa:
                        sent += 1
                        channels_set.add("whatsapp")
                        if whatsapp_notifier.notify(number=phone, text=text):
                            delivered += 1
                    if email:
                        sent += 1
                        channels_set.add("email")
                        if email_notifier.notify(to=email, text=text):
                            delivered += 1

                # The person who asked to be notified (the pre-run prompt / node
                # config) always gets the summary, so a test always lands.
                _send(_notify_target(config, inputs), _notify_email(config, inputs), summary)
                # Plus a warm, personal note to each employee on the sheet.
                for i, row in enumerate(roster):
                    _send(
                        _row_phone(row),
                        _row_email(row),
                        _employee_message(_row_name(row, i), str(_row_amount(row))),
                    )
                outputs.update(
                    notified=True,
                    sent_count=sent,
                    delivered_count=delivered,
                    channels=sorted(channels_set) or ["none"],
                )
            elif node.type == "app.credit_ledger":
                outputs.update(credited=amount)
        except (MonnifyError, SandboxError) as exc:
            return self._failed(node, str(exc), request=request)

        response = redact(
            {"status": 200, "body": {"ok": True, "node_id": node.id, "live": True, **outputs}}
        )
        return AdapterResult(
            ok=True,
            duration_ms=20,
            outputs=outputs,
            request=redact(request),
            response=response,
            waiting=is_wait,
        )

    def _failed(
        self, node: Node, error: str, *, request: dict[str, Any] | None = None
    ) -> AdapterResult:
        """Surface a provider/wiring failure as an honest failed node (D3)."""
        return AdapterResult(
            ok=False,
            duration_ms=20,
            outputs={"status": "failed"},
            request=redact(request or {"method": "LIVE", "path": f"/sandbox/{node.type}"}),
            response=redact(
                {"status": 502, "body": {"ok": False, "node_id": node.id, "error": error}}
            ),
            error=error,
        )

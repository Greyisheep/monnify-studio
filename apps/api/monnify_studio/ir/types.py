"""Core vocabulary for the IR — provider-agnostic (D13).

Nothing in this module mentions Monnify. The engine reasons in terms of
*capabilities* and *domain types*; providers (Monnify, and later others) map
their concrete endpoints onto this vocabulary via a node catalog.

Traceability: #3 (P1.1 — The IR); decisions D1, D9, D13.
"""

from __future__ import annotations

from enum import Enum


class NodeCategory(str, Enum):
    """Broad grouping used for canvas palettes and reasoning."""

    MONNIFY = "monnify"  # provider API calls (the pack fills these in)
    EVENT = "event"  # things Studio waits for (webhooks, callbacks, timers)
    CONTROL = "control"  # condition / wait / retry / parallel
    SAFETY = "safety"  # the correctness steps Studio makes *visible* (D9)
    APPLICATION = "application"  # the integrator's own logic (ledger, orders)


class CapabilityTag(str, Enum):
    """What a node *means* for correctness.

    The analyzer never looks at a node's `type` string — it reasons purely
    over these tags (D3). That is what keeps the rule engine provider-agnostic:
    a Paystack `verify` and a Monnify `verify` both carry
    AUTHORITATIVE_VERIFICATION and are treated identically.
    """

    # --- sources of (un)trust ---
    CLIENT_CALLBACK = "client_callback"  # browser redirect / client-reported state
    WEBHOOK_EVENT = "webhook_event"  # provider-delivered event
    WAIT_EVENT = "wait_event"  # async suspension point (D1 state-machine pause)

    # --- authoritative checks ---
    AUTHORITATIVE_VERIFICATION = "authoritative_verification"  # server-side verify w/ provider
    SIGNATURE_CHECK = "signature_check"
    AMOUNT_VALIDATION = "amount_validation"
    REFERENCE_VALIDATION = "reference_validation"
    IDEMPOTENCY_BOUNDARY = "idempotency_boundary"

    # --- money & effects ---
    FINANCIAL_FULFILMENT = "financial_fulfilment"  # grants value / marks paid
    MUTATES_LEDGER = "mutates_ledger"
    MONEY_MOVEMENT = "money_movement"  # payout / transfer / refund
    IMMEDIATE_SPLIT = "immediate_split"  # settles to sub-parties AT payment time
    CONDITIONAL_PAYOUT = "conditional_payout"  # payout is gated by a later event

    # --- reliability & hygiene ---
    RECONCILIATION = "reconciliation"
    AUDIT = "audit"
    RETRY = "retry"
    EXTERNAL_CALL = "external_call"
    SECRET_BOUNDARY = "secret_boundary"


class DomainType(str, Enum):
    """Types that flow along data connections, enabling typed wiring (D9 / §7.3).

    A connection is valid only if the producing port's type is compatible with
    the consuming port's type. `ANY` is the escape hatch; everything else is
    checked.
    """

    PAYMENT_REFERENCE = "PaymentReference"
    TRANSACTION_REFERENCE = "TransactionReference"
    TRANSFER_REFERENCE = "TransferReference"
    CHECKOUT_URL = "CheckoutUrl"
    MONEY = "Money"
    CUSTOMER = "Customer"
    ACCOUNT_NUMBER = "AccountNumber"
    BANK_LIST = "BankList"
    TRANSACTION_STATUS = "TransactionStatus"
    WEBHOOK_PAYLOAD = "WebhookPayload"
    SIGNATURE = "Signature"
    LEDGER_ENTRY = "LedgerEntry"
    BOOLEAN = "Boolean"
    ANY = "Any"


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"

    @property
    def rank(self) -> int:
        return {
            Severity.CRITICAL: 4,
            Severity.HIGH: 3,
            Severity.MEDIUM: 2,
            Severity.LOW: 1,
            Severity.INFO: 0,
        }[self]

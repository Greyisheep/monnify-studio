"""The Monnify provider pack (D13).

Every Monnify endpoint Studio understands is declared here as a `NodeTypeDef`,
mapping the concrete API onto the neutral capability vocabulary. This is the
only file that must be re-authored to add another payment provider.

`when_to_use` lines are quoted/condensed from the official Monnify API Feature
Cheat Sheet (#25), so Moni reasons from Monnify's documented features rather
than from training memory.

References: https://developers.monnify.com/api

Traceability: #3 (P1.1 - node catalog), #25 (cheat-sheet grounding); decision D13.
"""

from __future__ import annotations

from ..ir.types import CapabilityTag as T
from ..ir.types import DomainType as D
from ..ir.types import NodeCategory as C
from .base import NodeTypeDef, PortSpec

DOCS_COLLECTIONS = "https://developers.monnify.com/docs/collections"
DOCS_ONE_TIME = "https://developers.monnify.com/docs/collections/one-time-payment"
DOCS_API = "https://developers.monnify.com/api"

MONNIFY_NODE_TYPES: list[NodeTypeDef] = [
    NodeTypeDef(
        type="monnify.initialize_transaction",
        category=C.MONNIFY,
        title="Initialize Transaction",
        description="Create a transaction and get a checkout URL / payment reference.",
        when_to_use="Standard e-commerce checkout, one-off ticket sales, or simple digital "
        "product sales: a secure multi-channel widget (card, USSD, bank transfer).",
        doc_url=DOCS_ONE_TIME,
        default_tags=[T.EXTERNAL_CALL, T.SECRET_BOUNDARY],
        inputs=[
            PortSpec(name="amount", type=D.MONEY),
            PortSpec(name="customer", type=D.CUSTOMER, required=False),
        ],
        outputs=[
            PortSpec(name="payment_reference", type=D.PAYMENT_REFERENCE),
            PortSpec(name="checkout_url", type=D.CHECKOUT_URL),
        ],
    ),
    NodeTypeDef(
        type="monnify.verify_transaction",
        category=C.MONNIFY,
        title="Verify Transaction",
        description="Server-side query of authoritative payment status and amount paid.",
        when_to_use="Confirm a collection's real status and amount server-side after the "
        "webhook. Never trust the client callback; verify once rather than heavily polling.",
        doc_url=DOCS_API,
        # This IS the authoritative check - the antidote to trusting a callback.
        default_tags=[T.EXTERNAL_CALL, T.AUTHORITATIVE_VERIFICATION, T.SECRET_BOUNDARY],
        inputs=[PortSpec(name="payment_reference", type=D.PAYMENT_REFERENCE)],
        outputs=[
            PortSpec(name="status", type=D.TRANSACTION_STATUS),
            PortSpec(name="amount_paid", type=D.MONEY),
        ],
    ),
    NodeTypeDef(
        type="monnify.initiate_transfer",
        category=C.MONNIFY,
        title="Initiate Transfer (Disbursement)",
        description="Move money out to a beneficiary - e.g. the provider payout.",
        when_to_use="Real-time single payout from your Monnify wallet to any Nigerian bank "
        "account or wallet: user withdrawals, P2P, or an individual vendor payout.",
        doc_url=DOCS_API,
        default_tags=[T.EXTERNAL_CALL, T.MONEY_MOVEMENT, T.BENEFICIARY_TRANSFER, T.SECRET_BOUNDARY],
        inputs=[
            PortSpec(name="account_number", type=D.ACCOUNT_NUMBER),
            PortSpec(name="amount", type=D.MONEY),
        ],
        outputs=[PortSpec(name="transfer_reference", type=D.TRANSFER_REFERENCE)],
    ),
    NodeTypeDef(
        type="monnify.bulk_transfer",
        category=C.MONNIFY,
        title="Bulk Transfer",
        description="Disburse to up to 5,000 beneficiaries in one batch (payroll, vendors).",
        when_to_use="One batch of up to 5,000 payouts: automated payroll, affiliate rewards, "
        "or bulk multi-vendor settlements.",
        doc_url=DOCS_API,
        # Carries BENEFICIARY_TRANSFER so MON011 demands validation upstream (#54, #24).
        default_tags=[T.EXTERNAL_CALL, T.MONEY_MOVEMENT, T.BENEFICIARY_TRANSFER, T.SECRET_BOUNDARY],
        inputs=[PortSpec(name="amount", type=D.MONEY)],
        outputs=[PortSpec(name="transfer_reference", type=D.TRANSFER_REFERENCE)],
    ),
    NodeTypeDef(
        type="monnify.query_transfer_status",
        category=C.MONNIFY,
        title="Query Transfer Status",
        description="Authoritative status of a disbursement - required before retrying one.",
        when_to_use="Confirm a disbursement's real status, and always before retrying a "
        "transfer after an ambiguous timeout (the original may have succeeded).",
        doc_url=DOCS_API,
        default_tags=[T.EXTERNAL_CALL, T.SECRET_BOUNDARY],
        inputs=[PortSpec(name="transfer_reference", type=D.TRANSFER_REFERENCE)],
        outputs=[PortSpec(name="status", type=D.TRANSACTION_STATUS)],
    ),
    NodeTypeDef(
        type="monnify.transaction_split",
        category=C.MONNIFY,
        title="Transaction Split",
        description="Split settlement across subaccounts AT payment time (immediate).",
        when_to_use="Multi-vendor marketplaces that split one incoming payment across "
        "sub-accounts at payment time (e.g. take a platform fee before paying the vendor). "
        "Settles immediately, so it is the wrong tool when payout must wait for fulfilment.",
        doc_url=DOCS_API,
        # The primitive MON009 warns against for payout-after-fulfilment (D10).
        default_tags=[T.EXTERNAL_CALL, T.IMMEDIATE_SPLIT, T.MONEY_MOVEMENT, T.SECRET_BOUNDARY],
        inputs=[PortSpec(name="amount", type=D.MONEY)],
    ),
    NodeTypeDef(
        type="monnify.validate_bank_account",
        category=C.MONNIFY,
        title="Validate Bank Account (Name Enquiry)",
        description="KYC Match - resolve and confirm a beneficiary account name before paying it.",
        when_to_use="Onboarding/KYC and, critically, validating a payout account name (Name "
        "Enquiry) before a transfer, so money never lands in a wrong account. Also BVN/NIN.",
        doc_url=DOCS_API,
        default_tags=[T.EXTERNAL_CALL, T.BENEFICIARY_VALIDATION, T.SECRET_BOUNDARY],
        inputs=[PortSpec(name="account_number", type=D.ACCOUNT_NUMBER)],
        outputs=[PortSpec(name="account_name", type=D.ANY)],
    ),
    NodeTypeDef(
        type="monnify.create_reserved_account",
        category=C.MONNIFY,
        title="Create Reserved Account",
        description="Dedicated virtual account for a customer (wallet funding, invoices).",
        when_to_use="Fintech wallets, savings apps, or any platform where users fund an in-app "
        "balance via a permanent dedicated bank account (bank transfer).",
        doc_url=DOCS_COLLECTIONS,
        default_tags=[T.EXTERNAL_CALL, T.SECRET_BOUNDARY],
        inputs=[PortSpec(name="customer", type=D.CUSTOMER)],
        outputs=[PortSpec(name="account_number", type=D.ACCOUNT_NUMBER)],
    ),
    NodeTypeDef(
        type="monnify.initiate_refund",
        category=C.MONNIFY,
        title="Initiate Refund",
        description="Refund a previously verified transaction.",
        when_to_use="Automate order cancellations, e-commerce returns, or dispute resolution: "
        "an instant full or partial rollback to the customer's original payment source.",
        doc_url=DOCS_API,
        default_tags=[T.EXTERNAL_CALL, T.MONEY_MOVEMENT, T.SECRET_BOUNDARY],
        inputs=[PortSpec(name="transaction_reference", type=D.TRANSACTION_REFERENCE)],
    ),
]

"""The Monnify provider pack (D13).

Every Monnify endpoint Studio understands is declared here as a `NodeTypeDef`,
mapping the concrete API onto the neutral capability vocabulary. This is the
only file that must be re-authored to add another payment provider.

References: https://developers.monnify.com/api

Traceability: #3 (P1.1 — node catalog); decision D13.
"""

from __future__ import annotations

from ..ir.types import CapabilityTag as T
from ..ir.types import DomainType as D
from ..ir.types import NodeCategory as C
from .base import NodeTypeDef, PortSpec

MONNIFY_NODE_TYPES: list[NodeTypeDef] = [
    NodeTypeDef(
        type="monnify.initialize_transaction",
        category=C.MONNIFY,
        title="Initialize Transaction",
        description="Create a transaction and get a checkout URL / payment reference.",
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
        # This IS the authoritative check — the antidote to trusting a callback.
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
        description="Move money out to a beneficiary — e.g. the provider payout.",
        default_tags=[T.EXTERNAL_CALL, T.MONEY_MOVEMENT, T.SECRET_BOUNDARY],
        inputs=[
            PortSpec(name="account_number", type=D.ACCOUNT_NUMBER),
            PortSpec(name="amount", type=D.MONEY),
        ],
        outputs=[PortSpec(name="transfer_reference", type=D.TRANSFER_REFERENCE)],
    ),
    NodeTypeDef(
        type="monnify.query_transfer_status",
        category=C.MONNIFY,
        title="Query Transfer Status",
        description="Authoritative status of a disbursement — required before retrying one.",
        default_tags=[T.EXTERNAL_CALL, T.SECRET_BOUNDARY],
        inputs=[PortSpec(name="transfer_reference", type=D.TRANSFER_REFERENCE)],
        outputs=[PortSpec(name="status", type=D.TRANSACTION_STATUS)],
    ),
    NodeTypeDef(
        type="monnify.transaction_split",
        category=C.MONNIFY,
        title="Transaction Split",
        description="Split settlement across subaccounts AT payment time (immediate).",
        # The primitive MON009 warns against for payout-after-fulfilment (D10).
        default_tags=[T.EXTERNAL_CALL, T.IMMEDIATE_SPLIT, T.MONEY_MOVEMENT, T.SECRET_BOUNDARY],
        inputs=[PortSpec(name="amount", type=D.MONEY)],
    ),
    NodeTypeDef(
        type="monnify.create_reserved_account",
        category=C.MONNIFY,
        title="Create Reserved Account",
        description="Dedicated virtual account for a customer (wallet funding, invoices).",
        default_tags=[T.EXTERNAL_CALL, T.SECRET_BOUNDARY],
        inputs=[PortSpec(name="customer", type=D.CUSTOMER)],
        outputs=[PortSpec(name="account_number", type=D.ACCOUNT_NUMBER)],
    ),
    NodeTypeDef(
        type="monnify.initiate_refund",
        category=C.MONNIFY,
        title="Initiate Refund",
        description="Refund a previously verified transaction.",
        default_tags=[T.EXTERNAL_CALL, T.MONEY_MOVEMENT, T.SECRET_BOUNDARY],
        inputs=[PortSpec(name="transaction_reference", type=D.TRANSACTION_REFERENCE)],
    ),
]

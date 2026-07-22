"""Provider-neutral node types: events, safety steps, control flow, application.

These carry the correctness semantics that make Studio more than a diagram.
Crucially, the *safety* nodes are first-class and visible (D9) - Apply-Fix
inserts these exact boxes into the graph.

Traceability: #3 (P1.1 - node catalog); decisions D9, D1.
"""

from __future__ import annotations

from ..ir.types import CapabilityTag as T
from ..ir.types import DomainType as D
from ..ir.types import NodeCategory as C
from .base import NodeTypeDef, PortSpec

CORE_NODE_TYPES: list[NodeTypeDef] = [
    # --- events: the things Studio waits for (async suspension points, D1) ---
    NodeTypeDef(
        type="event.client_callback",
        category=C.EVENT,
        title="Client Callback",
        description="Browser redirect / client-reported result after checkout. NOT trustworthy.",
        default_tags=[T.CLIENT_CALLBACK, T.WAIT_EVENT],
        outputs=[PortSpec(name="payment_reference", type=D.PAYMENT_REFERENCE)],
    ),
    NodeTypeDef(
        type="event.payment_webhook",
        category=C.EVENT,
        title="Payment Webhook",
        description="Provider-delivered payment notification. Authentic only after signature check.",
        default_tags=[T.WEBHOOK_EVENT, T.WAIT_EVENT],
        outputs=[
            PortSpec(name="payload", type=D.WEBHOOK_PAYLOAD),
            PortSpec(name="signature", type=D.SIGNATURE),
            PortSpec(name="payment_reference", type=D.PAYMENT_REFERENCE),
        ],
    ),
    NodeTypeDef(
        type="event.fulfilment_confirmed",
        category=C.EVENT,
        title="Fulfilment Confirmed",
        description="Customer/admin confirms the job is done - the gate a payout must wait behind.",
        default_tags=[T.WAIT_EVENT, T.CONDITIONAL_PAYOUT],
    ),
    NodeTypeDef(
        type="event.scheduled",
        category=C.EVENT,
        title="Scheduled Trigger",
        description="Timer / cron entry point (e.g. nightly reconciliation).",
        default_tags=[T.WAIT_EVENT],
    ),
    # --- safety: correctness made visible (D9) ---
    NodeTypeDef(
        type="safety.verify_signature",
        category=C.SAFETY,
        title="Verify Webhook Signature",
        description="Reject forged events before any business logic runs.",
        default_tags=[T.SIGNATURE_CHECK],
        inputs=[
            PortSpec(name="payload", type=D.WEBHOOK_PAYLOAD),
            PortSpec(name="signature", type=D.SIGNATURE),
        ],
    ),
    NodeTypeDef(
        type="safety.validate_amount",
        category=C.SAFETY,
        title="Validate Amount",
        description="Compare amount actually paid against the expected amount.",
        default_tags=[T.AMOUNT_VALIDATION],
        inputs=[
            PortSpec(name="amount_paid", type=D.MONEY),
            PortSpec(name="expected_amount", type=D.MONEY),
        ],
        outputs=[PortSpec(name="matches", type=D.BOOLEAN)],
    ),
    NodeTypeDef(
        type="safety.idempotency_guard",
        category=C.SAFETY,
        title="Idempotency Guard",
        description="Ensure a repeated event/retry cannot cause a duplicate financial effect.",
        default_tags=[T.IDEMPOTENCY_BOUNDARY],
        inputs=[PortSpec(name="key", type=D.ANY)],
    ),
    NodeTypeDef(
        type="safety.balance_guard",
        category=C.SAFETY,
        title="Check Balance First",
        description="Confirm the available balance covers the amount before money moves out.",
        when_to_use="Before any transfer or payout from a wallet/ledger: query the "
        "available balance and only proceed if it covers the amount plus fees. "
        "Without it, disbursements fail at runtime with 'insufficient balance' "
        "(a live failure mode reported by Monnify merchants).",
        doc_url="https://developers.monnify.com/api",
        default_tags=[T.BALANCE_CHECK],
        inputs=[PortSpec(name="amount", type=D.MONEY)],
        outputs=[PortSpec(name="covered", type=D.BOOLEAN)],
    ),
    NodeTypeDef(
        type="safety.reconciliation",
        category=C.SAFETY,
        title="Reconciliation",
        description="Compare provider truth with local state and repair divergence.",
        default_tags=[T.RECONCILIATION, T.EXTERNAL_CALL],
    ),
    NodeTypeDef(
        type="safety.audit_event",
        category=C.SAFETY,
        title="Audit Event",
        description="Append an immutable audit record.",
        default_tags=[T.AUDIT],
    ),
    # --- control flow ---
    NodeTypeDef(
        type="control.condition",
        category=C.CONTROL,
        title="Condition",
        description="Branch on an expression.",
        inputs=[PortSpec(name="expression", type=D.BOOLEAN)],
    ),
    NodeTypeDef(
        type="control.retry",
        category=C.CONTROL,
        title="Retry",
        description="Retry a step. Dangerous around money movement without a status query.",
        default_tags=[T.RETRY],
    ),
    # --- application: the integrator's own effects ---
    NodeTypeDef(
        type="app.hold_funds",
        category=C.APPLICATION,
        title="Hold Funds (Ledger)",
        description="Record the collected amount in the platform ledger, held pending fulfilment.",
        default_tags=[T.MUTATES_LEDGER],
    ),
    NodeTypeDef(
        type="app.mark_order_paid",
        category=C.APPLICATION,
        title="Mark Order Paid / Fulfil",
        description="Grant value to the customer - the point of no return.",
        default_tags=[T.FINANCIAL_FULFILMENT],
    ),
    NodeTypeDef(
        type="app.credit_ledger",
        category=C.APPLICATION,
        title="Credit Ledger",
        description="Credit an internal wallet/ledger balance.",
        default_tags=[T.MUTATES_LEDGER, T.FINANCIAL_FULFILMENT],
    ),
    NodeTypeDef(
        type="app.release_payout",
        category=C.APPLICATION,
        title="Release Provider Payout",
        description="Authorise paying the provider - must wait for fulfilment.",
        default_tags=[T.FINANCIAL_FULFILMENT],
    ),
    NodeTypeDef(
        type="app.notify",
        category=C.APPLICATION,
        title="Send Notification",
        description="Send a non-financial run notification. Message comes from config.message.",
    ),
    NodeTypeDef(
        type="app.notify_whatsapp",
        category=C.APPLICATION,
        title="Send WhatsApp",
        description="Message a person on WhatsApp (via Evolution API) - e.g. send the "
        "invoice link, or a thank-you once payment is confirmed (#99).",
        inputs=[
            PortSpec(name="recipient", type=D.ANY, required=False),
            PortSpec(name="message", type=D.ANY, required=False),
        ],
    ),
    NodeTypeDef(
        type="custom.code",
        category=C.APPLICATION,
        title="Code Block",
        description="Your own code inside the flow (#147): the snippet lives in "
        "config.code, its declared outputs (config.outputs) feed the next Block "
        "in practice Runs, and it lands verbatim in the generated Python.",
        when_to_use="Write your own logic between Monnify calls - fees, filters, "
        "mappings, custom rules - when no catalog block does what you need.",
        # Opaque on purpose: EXTERNAL_CALL only. A Code Block must never carry a
        # safety tag, so it can never silently satisfy MON002/003/004 - the
        # analyzer treats it as an unknown effect, and the real safety blocks
        # stay mandatory around it (D3).
        default_tags=[T.EXTERNAL_CALL],
        inputs=[PortSpec(name="input", type=D.ANY, required=False)],
        outputs=[PortSpec(name="output", type=D.ANY, required=False)],
    ),
    NodeTypeDef(
        type="app.data_rows",
        category=C.APPLICATION,
        title="Data Rows (CSV / Sheet)",
        description="Rows from an uploaded CSV or spreadsheet-shaped source (e.g. employees). "
        "Canvas + mock execution only for now (#54, D17 tier-1 logic).",
        outputs=[PortSpec(name="rows", type=D.ANY)],
    ),
    NodeTypeDef(
        type="artifact.dashboard",
        category=C.APPLICATION,
        title="Dashboard",
        description="Publish the workflow's existing business dashboard artifact.",
    ),
    NodeTypeDef(
        type="artifact.invoice",
        category=C.APPLICATION,
        title="Invoice",
        description="Enable invoice creation and the hosted invoice surface for this workflow.",
    ),
]

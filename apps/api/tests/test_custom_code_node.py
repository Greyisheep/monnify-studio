"""Code Block in the catalog: real, opaque to the analyzer, honest v1 (#147)."""

from __future__ import annotations

from monnify_studio.analysis import analyze
from monnify_studio.ir.models import Edge, Node, Workflow
from monnify_studio.ir.types import CapabilityTag
from monnify_studio.providers import default_catalog


def test_code_block_is_in_the_catalog_with_opaque_tags():
    d = default_catalog().resolve("custom.code")
    assert d.title == "Code Block"
    # EXTERNAL_CALL only: no safety tags, no money tags. That opacity is the
    # security property - user code can never stand in for a safety Block.
    assert d.default_tags == [CapabilityTag.EXTERNAL_CALL]


def test_code_block_cannot_satisfy_safety_rules():
    """webhook -> Code Block -> mark paid must still trip the full homework:
    the dev's snippet claiming to verify things does not count (D3)."""
    wf = Workflow(
        id="code-opacity",
        name="Code Opacity",
        nodes=[
            Node(id="hook", type="event.payment_webhook", label="Webhook"),
            Node(id="code", type="custom.code", label="My Verify",
                 config={"code": "assert payload['signature'] == expected"}),
            Node(id="paid", type="app.mark_order_paid", label="Mark Paid"),
        ],
        edges=[
            Edge(source="hook", target="code", kind="event"),
            Edge(source="code", target="paid"),
        ],
        entrypoint="hook",
    )
    report = analyze(wf, default_catalog())
    rules = {f.rule_id for f in report.findings}
    # Signature, verification, and idempotency are all still missing.
    assert {"MON002", "MON003"} <= rules


def test_code_block_between_safe_flow_stays_clean():
    """A Code Block dropped into an otherwise-safe path adds no findings:
    opacity means neutral, not poisonous."""
    wf = Workflow(
        id="code-neutral",
        name="Code Neutral",
        nodes=[
            Node(id="hook", type="event.payment_webhook", label="Webhook"),
            Node(id="vsig", type="safety.verify_signature", label="Verify Sig"),
            Node(id="verify", type="monnify.verify_transaction", label="Verify"),
            Node(id="vamt", type="safety.validate_amount", label="Amount"),
            Node(id="idem", type="safety.idempotency_guard", label="Idem"),
            Node(id="code", type="custom.code", label="My Fee Logic",
                 config={"code": "ctx['fee'] = 100", "outputs": {"fee": "100"}}),
            Node(id="paid", type="app.mark_order_paid", label="Mark Paid"),
        ],
        edges=[
            Edge(source="hook", target="vsig", kind="event"),
            Edge(source="vsig", target="verify"),
            Edge(source="verify", target="vamt"),
            Edge(source="vamt", target="idem"),
            Edge(source="idem", target="code"),
            Edge(source="code", target="paid"),
        ],
        entrypoint="hook",
    )
    report = analyze(wf, default_catalog())
    assert report.findings == [], [f.rule_id for f in report.findings]

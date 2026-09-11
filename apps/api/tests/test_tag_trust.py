"""The tag trust boundary (#270): a document may describe, never vouch.

`Node.extra_tags` travels on the workflow document, which round-trips through the
browser and comes back through `PUT /workflows/{id}` and `POST /analyze`. If a
document could assert a guard tag, it could talk the analyzer out of its own
findings, and a green report would mean nothing.

These tests hold the line from both ends: the guards cannot be claimed, and the
tags we DO let anything claim are proven unable to suppress a finding.
"""

from __future__ import annotations

import pytest

from monnify_studio.analysis.engine import Analysis
from monnify_studio.analysis.rules import RULES
from monnify_studio.fixtures import unsafe_marketplace
from monnify_studio.ir.models import Edge, Node, Workflow
from monnify_studio.ir.types import SELF_DECLARABLE_TAGS, CapabilityTag as T
from monnify_studio.providers.base import Catalog
from monnify_studio.providers.core import CORE_NODE_TYPES
from monnify_studio.providers.monnify import MONNIFY_NODE_TYPES


def _catalog() -> Catalog:
    return Catalog().register_pack(CORE_NODE_TYPES).register_pack(MONNIFY_NODE_TYPES)


def _findings(workflow: Workflow) -> set[tuple[str, tuple[str, ...]]]:
    """Findings as (rule_id, implicated nodes), so a suppressed finding is visible
    even when another finding of the same rule survives elsewhere in the graph."""
    analysis = Analysis(workflow, _catalog())
    return {(f.rule_id, tuple(f.node_ids)) for rule in RULES for f in rule(analysis)}


def _callback_to_payout(extra_tags: list[T]) -> Workflow:
    """The shortest unsafe shape there is: a browser callback grants value, with a
    Code Block in between carrying whatever the document claims for it."""
    return Workflow(
        id="trust-probe",
        name="trust probe",
        nodes=[
            Node(id="cb", type="event.client_callback"),
            Node(id="code", type="custom.code", extra_tags=extra_tags),
            Node(id="paid", type="app.mark_order_paid"),
        ],
        edges=[Edge(source="cb", target="code"), Edge(source="code", target="paid")],
    )


def test_code_block_cannot_claim_to_be_the_verifier():
    """The `custom.code` docstring promises a Code Block can never satisfy a safety
    rule. Your own code between a callback and a fulfilment is exactly the thing
    MON001 exists to catch, and saying otherwise on the document must not help."""
    honest = {rule_id for rule_id, _ in _findings(_callback_to_payout([]))}
    assert "MON001" in honest

    claiming = {rule_id for rule_id, _ in _findings(
        _callback_to_payout([T.AUTHORITATIVE_VERIFICATION])
    )}
    assert "MON001" in claiming, (
        "a Code Block talked MON001 out of firing by declaring itself the "
        "authoritative verifier - the analyzer trusted the document over the catalog"
    )


def test_a_document_cannot_disarm_the_unsafe_hero():
    """The whole-graph version: claim every guard on every node and the hero must
    stay exactly as unsafe as it was."""
    baseline = _findings(unsafe_marketplace())
    assert len(baseline) >= 4  # MON001, MON002, MON003, MON009

    armed = unsafe_marketplace()
    for node in armed.nodes:
        node.extra_tags = list(T)  # every tag in the vocabulary, including guards

    assert _findings(armed) >= baseline, (
        f"a document suppressed {sorted(baseline - _findings(armed))} by asserting "
        "guard tags about its own nodes"
    )


@pytest.mark.parametrize("tag", sorted(SELF_DECLARABLE_TAGS, key=lambda t: t.value))
def test_self_declarable_tags_cannot_suppress_a_finding(tag: T):
    """The allowlist earns its place, one tag at a time.

    A tag is only safe to self-declare if claiming it can never remove a warning.
    Add a rule that reads one of these as a guard and this test fails, which is
    the point: the list stops being true the moment the rules change, and it
    should not be possible to discover that in production.
    """
    baseline = _findings(unsafe_marketplace())

    claimed = unsafe_marketplace()
    for node in claimed.nodes:
        node.extra_tags = [tag]

    assert _findings(claimed) >= baseline, (
        f"{tag.value} is on the self-declarable allowlist but suppressed "
        f"{sorted(baseline - _findings(claimed))}. It is a guard: remove it from "
        "SELF_DECLARABLE_TAGS in ir/types.py."
    )


def test_a_node_can_still_describe_itself():
    """Not a lockout. Declaring an effect is how a Code Block that really does move
    money tells the rules to guard it, which makes the report stricter, never looser."""
    plain = Workflow(
        id="describe",
        name="describe",
        nodes=[
            Node(id="hook", type="event.payment_webhook"),
            Node(id="code", type="custom.code"),
        ],
        edges=[Edge(source="hook", target="code")],
    )
    assert not _findings(plain)

    honest = Workflow(
        id="describe",
        name="describe",
        nodes=[
            Node(id="hook", type="event.payment_webhook"),
            Node(id="code", type="custom.code", extra_tags=[T.FINANCIAL_FULFILMENT]),
        ],
        edges=[Edge(source="hook", target="code")],
    )
    # Now it grants value straight off a webhook: unsigned and non-idempotent.
    assert {rule_id for rule_id, _ in _findings(honest)} == {"MON002", "MON003"}

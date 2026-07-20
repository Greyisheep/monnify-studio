"""MON012 - the wallet must cover a payout before money moves (#108).

The live merchant failure this prevents: payday fires and the disbursement dies
at runtime with "You do not have sufficient balance". The rule is MON011's
structural twin; balance math elsewhere is exact-kobo (D21).
"""

from __future__ import annotations

from monnify_studio.analysis import analyze
from monnify_studio.fixtures import safe_marketplace
from monnify_studio.ir.models import Edge, Node, Workflow
from monnify_studio.providers import default_catalog
from monnify_studio.remediation import apply_fix, remediate_all
from monnify_studio.templates import build_template


def _payout_wf(with_guard: bool) -> Workflow:
    """Minimal payout: confirm → validate → [balance?] → transfer."""
    nodes = [
        Node(id="confirm", type="event.fulfilment_confirmed"),
        Node(id="validate", type="monnify.validate_bank_account"),
        Node(id="transfer", type="monnify.initiate_transfer"),
    ]
    edges = [
        Edge(source="confirm", target="validate", kind="event"),
        Edge(source="validate", target="transfer"),
    ]
    if with_guard:
        nodes.insert(2, Node(id="balance", type="safety.balance_guard"))
        edges = [
            Edge(source="confirm", target="validate", kind="event"),
            Edge(source="validate", target="balance"),
            Edge(source="balance", target="transfer"),
        ]
    return Workflow(id="p", name="p", nodes=nodes, edges=edges, entrypoint="confirm")


def _ids(wf) -> set[str]:
    return {f.rule_id for f in analyze(wf, default_catalog()).findings}


def test_mon012_fires_when_balance_is_unchecked():
    assert "MON012" in _ids(_payout_wf(with_guard=False))


def test_mon012_clears_when_balance_is_guarded():
    assert "MON012" not in _ids(_payout_wf(with_guard=True))


def test_payroll_template_checks_balance_before_payday():
    # The template models the fix for the real Slack failure: no findings at all.
    report = analyze(build_template("payroll"), default_catalog())
    assert report.findings == []
    types = {n.type for n in build_template("payroll").nodes}
    assert "safety.balance_guard" in types


def test_safe_hero_checks_balance_before_transfer():
    assert "MON012" not in _ids(safe_marketplace())


def test_apply_fix_mon012_inserts_guard_and_clears():
    catalog = default_catalog()
    wf = _payout_wf(with_guard=False)
    finding = next(f for f in analyze(wf, catalog).findings if f.rule_id == "MON012")
    fixed, step = apply_fix(wf, finding, catalog)
    assert step.added_nodes
    assert "MON012" not in {f.rule_id for f in analyze(fixed, catalog).findings}


def test_remediate_all_clears_a_bare_transfer_completely():
    # A totally unguarded payout trips several rules; the full loop ends clean,
    # which is exactly what Moni's compose loop relies on (#106).
    catalog = default_catalog()
    bare = Workflow(
        id="b",
        name="b",
        nodes=[
            Node(id="confirm", type="event.fulfilment_confirmed"),
            Node(id="transfer", type="monnify.initiate_transfer"),
        ],
        edges=[Edge(source="confirm", target="transfer", kind="event")],
        entrypoint="confirm",
    )
    result = remediate_all(bare, catalog)
    assert result.remaining == []
    types = {n.type for n in result.workflow.nodes}
    assert "safety.balance_guard" in types
    assert "monnify.validate_bank_account" in types

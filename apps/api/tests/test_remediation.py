"""Apply-Fix contract: remediation removes findings and converges (#6)."""

from __future__ import annotations

from monnify_studio.analysis import analyze
from monnify_studio.fixtures import unsafe_marketplace
from monnify_studio.providers import default_catalog
from monnify_studio.remediation import apply_fix, remediate_all


def test_remediate_all_makes_the_unsafe_hero_clean():
    catalog = default_catalog()
    result = remediate_all(unsafe_marketplace(), catalog)
    assert result.remaining == [], [f.rule_id for f in result.remaining]


def test_remediate_all_addresses_every_finding():
    catalog = default_catalog()
    result = remediate_all(unsafe_marketplace(), catalog)
    fixed = {s.rule_id for s in result.steps}
    assert {"MON001", "MON002", "MON003", "MON009"} <= fixed


def test_apply_single_fix_clears_only_that_finding_type():
    catalog = default_catalog()
    report = analyze(unsafe_marketplace(), catalog)
    mon001 = next(f for f in report.findings if f.rule_id == "MON001")
    fixed, step = apply_fix(unsafe_marketplace(), mon001, catalog)
    remaining_ids = {f.rule_id for f in analyze(fixed, catalog).findings}
    assert "MON001" not in remaining_ids
    assert step.added_nodes  # it actually inserted safety nodes (D9)


def test_remediation_is_pure():
    catalog = default_catalog()
    wf = unsafe_marketplace()
    nodes_before, edges_before = len(wf.nodes), len(wf.edges)
    remediate_all(wf, catalog)
    assert (len(wf.nodes), len(wf.edges)) == (nodes_before, edges_before)


def test_inserted_nodes_have_unique_ids():
    catalog = default_catalog()
    result = remediate_all(unsafe_marketplace(), catalog)
    ids = [n.id for n in result.workflow.nodes]
    assert len(ids) == len(set(ids))

"""The analyzer's contract: exactly which rules fire on the hero fixtures."""

from __future__ import annotations

from monnify_studio.analysis import analyze
from monnify_studio.fixtures import safe_marketplace, unsafe_marketplace
from monnify_studio.providers import default_catalog


def _rule_ids(workflow) -> set[str]:
    report = analyze(workflow, default_catalog())
    return {f.rule_id for f in report.findings}


def test_unsafe_marketplace_flags_the_expected_rules():
    ids = _rule_ids(unsafe_marketplace())
    assert "MON001" in ids  # client callback → fulfilment, no verify
    assert "MON002" in ids  # webhook → effect, no signature check
    assert "MON003" in ids  # webhook → effect, no idempotency
    assert "MON009" in ids  # immediate split + payout-after-fulfilment


def test_safe_marketplace_is_clean():
    report = analyze(safe_marketplace(), default_catalog())
    assert report.findings == [], [f.rule_id for f in report.findings]


def test_findings_sorted_most_severe_first():
    report = analyze(unsafe_marketplace(), default_catalog())
    ranks = [f.severity.rank for f in report.findings]
    assert ranks == sorted(ranks, reverse=True)


def test_catalog_covers_every_node_type_used():
    catalog = default_catalog()
    for wf in (unsafe_marketplace(), safe_marketplace()):
        for node in wf.nodes:
            assert catalog.get(node.type) is not None, f"missing catalog def: {node.type}"

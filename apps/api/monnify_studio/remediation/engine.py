"""Apply-Fix: turn a finding into an IR rewrite that removes it (#6).

Each MON rule has a matching transform that inserts the safety node(s) the
finding calls for — or removes the offending node. `remediate_all` runs the exact
loop the UI runs: analyze → fix the top finding → re-analyze, until the graph is
clean. Correctness stays deterministic — remediation edits the graph, but the
analyzer (D3), never an LLM, decides when we're done.

The inserted safety nodes are structural (tags + placement); wiring their typed
inputs is left to codegen/execution (Epic 2/3). That's enough for the graph to be
correct *and* to analyze clean.

Traceability: #6 (P1.4 — Remediation); decisions D3, D9, D10.
"""

from __future__ import annotations

from typing import Callable

from pydantic import BaseModel, Field

from ..analysis import Finding, analyze
from ..ir.models import Workflow
from ..ir.types import CapabilityTag
from ..providers.base import Catalog
from .graph_ops import insert_chain_on_edge, remove_node_reconnect


class RemediationStep(BaseModel):
    """One applied fix — what the UI shows in the graph diff."""

    rule_id: str
    action: str
    added_nodes: list[str] = Field(default_factory=list)
    removed_nodes: list[str] = Field(default_factory=list)


class RemediationResult(BaseModel):
    workflow: Workflow
    steps: list[RemediationStep]
    remaining: list[Finding]


def _final_edge(finding: Finding) -> tuple[str, str]:
    """The last edge into the danger — where a guard must be spliced."""
    if len(finding.path) < 2:
        raise ValueError(f"{finding.rule_id} finding has no path to remediate")
    return finding.path[-2], finding.path[-1]


# --- per-rule transforms: (workflow, finding, catalog) -> RemediationStep ---
# Each mutates `wf` in place (apply_fix has already copied it).


def _fix_mon001(wf: Workflow, finding: Finding, catalog: Catalog) -> RemediationStep:
    src, dst = _final_edge(finding)
    ids = insert_chain_on_edge(
        wf,
        src,
        dst,
        [
            ("monnify.verify_transaction", "Verify Transaction"),
            ("safety.validate_amount", "Validate Amount"),
            ("safety.idempotency_guard", "Idempotency Guard"),
        ],
    )
    return RemediationStep(
        rule_id="MON001",
        action=f"Inserted server-side verification, amount check and idempotency before '{dst}'",
        added_nodes=ids,
    )


def _fix_mon002(wf: Workflow, finding: Finding, catalog: Catalog) -> RemediationStep:
    src, dst = _final_edge(finding)
    ids = insert_chain_on_edge(wf, src, dst, [("safety.verify_signature", "Verify Signature")])
    return RemediationStep(
        rule_id="MON002", action=f"Inserted signature verification after '{src}'", added_nodes=ids
    )


def _fix_mon003(wf: Workflow, finding: Finding, catalog: Catalog) -> RemediationStep:
    src, dst = _final_edge(finding)
    ids = insert_chain_on_edge(wf, src, dst, [("safety.idempotency_guard", "Idempotency Guard")])
    return RemediationStep(
        rule_id="MON003", action=f"Inserted idempotency guard before '{dst}'", added_nodes=ids
    )


def _fix_mon004(wf: Workflow, finding: Finding, catalog: Catalog) -> RemediationStep:
    src, dst = _final_edge(finding)
    ids = insert_chain_on_edge(wf, src, dst, [("safety.validate_amount", "Validate Amount")])
    return RemediationStep(
        rule_id="MON004", action=f"Inserted amount validation before '{dst}'", added_nodes=ids
    )


def _fix_mon009(wf: Workflow, finding: Finding, catalog: Catalog) -> RemediationStep:
    # Remove the immediate-split node(s); the provider is paid via Transfer after
    # fulfilment instead (D10). Identify them by tag, not type string, so this stays
    # provider-agnostic.
    split_ids = [
        n.id for n in wf.nodes if CapabilityTag.IMMEDIATE_SPLIT in catalog.effective_tags(n)
    ]
    for sid in split_ids:
        remove_node_reconnect(wf, sid)
    return RemediationStep(
        rule_id="MON009",
        action="Removed immediate transaction-split; provider paid via Transfer after fulfilment",
        removed_nodes=split_ids,
    )


REMEDIATIONS: dict[str, Callable[[Workflow, Finding, Catalog], RemediationStep]] = {
    "MON001": _fix_mon001,
    "MON002": _fix_mon002,
    "MON003": _fix_mon003,
    "MON004": _fix_mon004,
    "MON009": _fix_mon009,
}


def apply_fix(
    workflow: Workflow, finding: Finding, catalog: Catalog
) -> tuple[Workflow, RemediationStep]:
    """Apply one finding's remediation, returning a new workflow (pure — the input
    is not mutated) and a description of the change."""
    wf = workflow.model_copy(deep=True)
    fn = REMEDIATIONS.get(finding.rule_id)
    if fn is None:
        return wf, RemediationStep(
            rule_id=finding.rule_id, action="no automated remediation available"
        )
    return wf, fn(wf, finding, catalog)


def remediate_all(workflow: Workflow, catalog: Catalog) -> RemediationResult:
    """Fix findings until the workflow is clean (or no rule can make progress).

    Runs the UI's loop: analyze, fix the most-severe finding, re-analyze. The
    budget guarantees termination even if some finding has no automated fix."""
    wf = workflow.model_copy(deep=True)
    steps: list[RemediationStep] = []
    report = analyze(wf, catalog)
    budget = len(report.findings) + 5
    while report.findings and budget > 0:
        top = report.findings[0]
        if top.rule_id not in REMEDIATIONS:
            break  # nothing more we can automate; leave the rest as `remaining`
        wf, step = apply_fix(wf, top, catalog)
        steps.append(step)
        report = analyze(wf, catalog)
        budget -= 1
    return RemediationResult(workflow=wf, steps=steps, remaining=report.findings)

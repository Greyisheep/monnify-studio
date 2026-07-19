"""Architecture-review entry point."""

from __future__ import annotations

from pydantic import BaseModel

from ..ir.models import Workflow
from ..ir.types import Severity
from ..providers.base import Catalog
from .engine import Analysis, Finding
from .rules import RULES


class Report(BaseModel):
    workflow_id: str
    findings: list[Finding]

    @property
    def counts(self) -> dict[str, int]:
        out = {s.value: 0 for s in Severity}
        for f in self.findings:
            out[f.severity.value] += 1
        return out

    @property
    def criticals(self) -> int:
        return self.counts[Severity.CRITICAL.value]


def analyze(workflow: Workflow, catalog: Catalog) -> Report:
    """Run every rule and return findings sorted most-severe first."""
    analysis = Analysis(workflow, catalog)
    findings: list[Finding] = []
    for rule in RULES:
        findings.extend(rule(analysis))
    findings.sort(key=lambda f: f.severity.rank, reverse=True)
    return Report(workflow_id=workflow.id, findings=findings)


__all__ = ["Analysis", "Finding", "Report", "analyze"]

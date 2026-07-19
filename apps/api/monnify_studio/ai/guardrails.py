"""Redaction + system prompts for the constrained assistant (#15)."""

from __future__ import annotations

import re
from typing import Any

from monnify_studio.analysis import Report
from monnify_studio.ir.models import Workflow

_SECRET_KEYS = re.compile(
    r"(secret|password|api[_-]?key|authorization|token|private[_-]?key|bearer)",
    re.IGNORECASE,
)
_BEARER = re.compile(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE)

CHAT_SYSTEM = """You are Monnify Studio's architecture assistant.
You help engineers reason about payment-integration graphs (IR nodes/edges)
and Architecture Review findings (MON00x rules).

Hard rules:
- Never invent API keys, secrets, or account numbers.
- Never declare a payment financially successful — only the analyzer and
  executor decide correctness.
- Prefer short, concrete answers grounded in the supplied workflow/findings.
- If asked to change money-movement logic, explain the pattern and point to
  Apply Fix / Design mode rather than fabricating IR JSON.
"""


def redact_mapping(value: Any) -> Any:
    """Strip likely secrets from nested dict/list payloads before AI context."""
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, item in value.items():
            if _SECRET_KEYS.search(str(key)):
                out[key] = "[REDACTED]"
            else:
                out[key] = redact_mapping(item)
        return out
    if isinstance(value, list):
        return [redact_mapping(item) for item in value]
    if isinstance(value, str):
        return _BEARER.sub("Bearer [REDACTED]", value)
    return value


def workflow_context(workflow: Workflow | None, selected_node_id: str | None) -> str:
    if workflow is None:
        return "No workflow loaded."
    safe = redact_mapping(workflow.model_dump(mode="json"))
    lines = [
        f"Workflow: {safe.get('name')} ({safe.get('id')}) v{safe.get('version')}",
        f"Entrypoint: {safe.get('entrypoint')}",
        "Nodes:",
    ]
    for node in safe.get("nodes") or []:
        marker = " ← selected" if node.get("id") == selected_node_id else ""
        lines.append(
            f"- {node.get('id')}: type={node.get('type')} label={node.get('label')}{marker}"
        )
    lines.append("Edges:")
    for edge in safe.get("edges") or []:
        lines.append(
            f"- {edge.get('source')} → {edge.get('target')} "
            f"({edge.get('kind')}, {edge.get('condition')})"
        )
    return "\n".join(lines)


def findings_context(report: Report | None) -> str:
    if report is None or not report.findings:
        return "Findings: none (clean or not analyzed)."
    lines = ["Findings:"]
    for finding in report.findings:
        lines.append(
            f"- [{finding.severity}] {finding.rule_id}: {finding.title} — {finding.message}"
        )
        if finding.path:
            lines.append(f"  path: {' → '.join(finding.path)}")
    return "\n".join(lines)

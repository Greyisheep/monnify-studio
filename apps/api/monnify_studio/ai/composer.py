"""Moni composes full flows from the catalog (#15, D18): the ceiling.

"I want an ajo app with Monnify" comes in; a complete, editable Workflow comes
out. Moni proposes freely, but only from real catalog node types, and every
proposal passes the same deterministic gates as a hand-built flow: catalog
validation (one retry with the errors), then the analyzer, then Apply-Fix.
AI proposes, the analyzer disposes; correctness never rests on the model (D3).
"""

from __future__ import annotations

import re
from collections import deque

from pydantic import BaseModel

from ..analysis import Report, analyze
from ..ir.models import Edge, Node, Position, Workflow
from ..observability import get_logger
from ..providers import default_catalog
from ..providers.base import Catalog
from ..remediation import remediate_all
from ..remediation.engine import RemediationStep
from .providers import AIProvider, select_provider
from .schema import MoniFlow

log = get_logger("ai.composer")

_SYSTEM = (
    "You are Moni, the flow composer for Monnify Studio. Design a payment "
    "workflow for the user's business need as a graph.\n"
    "Rules:\n"
    "- Use ONLY node types from the catalog given to you; invent nothing. The "
    "'when to use' text comes from Monnify's own docs; trust it over prior "
    "knowledge of Monnify.\n"
    "- Give every node a unique snake_case id and a short human label.\n"
    "- Edges leaving event.* nodes have kind 'event'; all others 'control'.\n"
    "- Money must be handled safely: verify webhooks and transactions, validate "
    "amounts and beneficiary accounts, guard effects with idempotency, and "
    "reconcile. A static analyzer will audit your graph.\n"
    "- Keep it focused: 6 to 14 nodes covering the core money flow.\n"
    "- In `explanation`, tell the user in plain language what the flow does."
)


class ComposeUnavailable(Exception):
    """No LLM provider is available; composition (unlike intent) needs one."""


class ComposeError(Exception):
    def __init__(self, errors: list[str]) -> None:
        super().__init__("; ".join(errors))
        self.errors = errors


class ComposeOutcome(BaseModel):
    workflow: Workflow
    report_before: Report
    report_after: Report
    steps: list[RemediationStep]
    provider: str
    explanation: str = ""


# Internal breadcrumbs (issue/decision refs, dev caveats) that must never reach
# the model; the catalog is authored for humans, Moni gets the clean version.
_NOISE = re.compile(r"\s*\((?:#\d+|D\d+)[^)]*\)|Canvas \+ mock execution only for now\.?")


def _clean(text: str) -> str:
    out = _NOISE.sub("", text)
    out = re.sub(r"\s{2,}", " ", out)
    out = re.sub(r"\s+([.,])", r"\1", out)  # no space left before punctuation
    out = re.sub(r"\.{2,}", ".", out)  # collapse doubled periods from removals
    return out.strip(" -")


def _catalog_prompt(catalog: Catalog) -> str:
    """Grounded catalog for Moni: Monnify's own 'when to use' + doc link (#25).

    We feed `when_to_use` (sourced from the Monnify cheat sheet) over the terse
    internal description, so she composes from documented features, not memory.
    """
    lines = ["Catalog of node types (type | title | when to use | docs):"]
    for type_id in catalog.types():
        d = catalog.resolve(type_id)
        meaning = _clean(d.when_to_use or d.description)
        docs = f" | {d.doc_url}" if d.doc_url else ""
        lines.append(f"- {d.type} | {d.title} | {meaning}{docs}")
    return "\n".join(lines)


def _validate(flow: MoniFlow, catalog: Catalog) -> list[str]:
    errors: list[str] = []
    if len(flow.nodes) < 2:
        errors.append("the flow needs at least 2 nodes")
    seen: set[str] = set()
    for n in flow.nodes:
        if n.id in seen:
            errors.append(f"duplicate node id: {n.id}")
        seen.add(n.id)
        if catalog.get(n.type) is None:
            errors.append(f"unknown node type: {n.type}")
    for e in flow.edges:
        if e.source not in seen:
            errors.append(f"edge source is not a node: {e.source}")
        if e.target not in seen:
            errors.append(f"edge target is not a node: {e.target}")
    return errors


def _layout(flow: MoniFlow) -> dict[str, Position]:
    """Simple layered layout; the canvas re-layouts after Apply-Fix anyway (#41)."""
    incoming = {n.id: 0 for n in flow.nodes}
    adj: dict[str, list[str]] = {n.id: [] for n in flow.nodes}
    for e in flow.edges:
        if e.source in adj and e.target in incoming:
            adj[e.source].append(e.target)
            incoming[e.target] += 1
    depth = {nid: 0 for nid, deg in incoming.items() if deg == 0}
    queue = deque(depth)
    while queue:
        nid = queue.popleft()
        for succ in adj[nid]:
            if succ not in depth or depth[succ] < depth[nid] + 1:
                depth[succ] = depth[nid] + 1
                queue.append(succ)
    lanes: dict[int, int] = {}
    positions: dict[str, Position] = {}
    for n in flow.nodes:
        d = depth.get(n.id, 0)
        lane = lanes.get(d, 0)
        lanes[d] = lane + 1
        positions[n.id] = Position(x=40 + d * 240, y=60 + lane * 170)
    return positions


def _to_workflow(flow: MoniFlow, catalog: Catalog) -> Workflow:
    positions = _layout(flow)
    nodes = [
        Node(
            id=n.id,
            type=n.type,
            label=n.label or catalog.resolve(n.type).title,
            position=positions[n.id],
        )
        for n in flow.nodes
    ]
    edges = [
        Edge(source=e.source, target=e.target, kind="event" if e.kind == "event" else "control")
        for e in flow.edges
    ]
    slug = "".join(c if c.isalnum() else "-" for c in flow.name.lower()).strip("-")[:32]
    return Workflow(
        id=f"moni-{slug or 'flow'}",
        name=flow.name,
        provider="monnify",
        description=flow.description,
        nodes=nodes,
        edges=edges,
        entrypoint=nodes[0].id if nodes else None,
    )


def compose_flow(message: str, *, provider: str | None = None) -> ComposeOutcome:
    """The full ceiling pipeline: propose, validate (retry once), analyze, fix."""
    catalog = default_catalog()
    chosen: AIProvider = select_provider(provider)
    user = f"{_catalog_prompt(catalog)}\n\nUser need: {message.strip()}"

    try:
        flow = chosen.structured(
            system=_SYSTEM, user=user, message=message, schema=MoniFlow, max_tokens=4096
        )
    except NotImplementedError as exc:
        raise ComposeUnavailable("composing flows needs an AI provider key") from exc

    errors = _validate(flow, catalog)
    if errors:
        # One corrective round: tell Moni exactly what was wrong.
        retry_user = user + "\n\nYour previous attempt failed validation:\n" + "\n".join(
            f"- {e}" for e in errors
        )
        flow = chosen.structured(
            system=_SYSTEM, user=retry_user, message=message, schema=MoniFlow, max_tokens=4096
        )
        errors = _validate(flow, catalog)
        if errors:
            raise ComposeError(errors)

    workflow = _to_workflow(flow, catalog)
    report_before = analyze(workflow, catalog)
    result = remediate_all(workflow, catalog)
    report_after = analyze(result.workflow, catalog)
    log.info(
        "composer.done",
        provider=chosen.name,
        nodes=len(workflow.nodes),
        findings_before=len(report_before.findings),
        findings_after=len(report_after.findings),
        steps=len(result.steps),
    )
    return ComposeOutcome(
        workflow=result.workflow,
        report_before=report_before,
        report_after=report_after,
        steps=result.steps,
        provider=chosen.name,
        explanation=flow.explanation,
    )

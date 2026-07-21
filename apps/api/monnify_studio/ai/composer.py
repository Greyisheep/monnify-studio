"""Moni composes full flows from the catalog (#15, D18): the ceiling.

"I want an ajo app with Monnify" comes in; a complete, editable Workflow comes
out. Moni proposes freely, but only from real catalog node types, and every
proposal passes the same deterministic gates as a hand-built flow: catalog
validation (one retry with the errors), then the analyzer, then Apply-Fix.
AI proposes, the analyzer disposes; correctness never rests on the model (D3).
"""

from __future__ import annotations

import os
import re
from collections import deque

from pydantic import BaseModel, ValidationError

from ..analysis import Report, analyze
from ..ir.models import Edge, Node, Position, Workflow
from ..observability import get_logger
from ..providers import default_catalog
from ..providers.base import Catalog
from ..remediation import remediate_all
from ..remediation.engine import RemediationStep
from .fidelity import intent_gaps
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
    "- Connect the nodes: every node must be wired into the graph, no islands.\n"
    "- If the request is NOT a money/payment workflow you can build from these "
    "nodes, do not invent an unrelated flow. Set feasible=false and put one plain "
    "sentence in `refusal` telling the user what you can do instead.\n"
    "- If a previous attempt is described as still failing the analyzer, change "
    "the graph to resolve exactly those findings.\n"
    "- In `explanation`, tell the user in plain language what the flow does."
)


class ComposeUnavailable(Exception):
    """No LLM provider is available; composition (unlike intent) needs one."""


class ComposeError(Exception):
    """Moni tried but could not produce a verifiably safe flow (retries exhausted)."""

    def __init__(self, errors: list[str]) -> None:
        super().__init__("; ".join(errors))
        self.errors = errors


class ComposeRefused(Exception):
    """Moni honestly declined: the request is not a Monnify money flow (#106).

    Distinct from ComposeError so the API can phrase it as a friendly decline
    rather than a failure.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


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
    # Connectivity: a pile of unconnected nodes has nothing reachable, so the
    # analyzer would pass it vacuously and we'd ship an inert "clean" flow (#106).
    if flow.nodes and not flow.edges:
        errors.append("the flow has no connections between its nodes")
    elif flow.edges:
        incident = {e.source for e in flow.edges} | {e.target for e in flow.edges}
        islands = sorted(n.id for n in flow.nodes if n.id not in incident)
        if islands:
            errors.append(f"these nodes are not connected to anything: {', '.join(islands)}")
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


def _to_workflow(flow: MoniFlow, catalog: Catalog, keep_id: str | None = None) -> Workflow:
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
        # Refine (#148) revises the flow already on the whiteboard: it must keep
        # its id so the canvas and store update in place instead of forking.
        id=keep_id or f"moni-{slug or 'flow'}",
        name=flow.name,
        provider="monnify",
        description=flow.description,
        nodes=nodes,
        edges=edges,
        entrypoint=nodes[0].id if nodes else None,
    )


# Generous ceiling so a large flow's JSON never truncates (#15). With thinking
# disabled on the provider side, the whole budget goes to the graph.
_MAX_TOKENS = 8192

# Generate -> verify -> refine rounds before Moni refuses (#106). Round 1 is the
# first attempt; the rest are corrective, each fed the exact residual findings.
# A hard cap is the safety valve against a model that never converges (the ADK
# lesson: deterministic exit + bounded iterations, never a model-invoked stop).
_MAX_ROUNDS = int(os.getenv("MONI_COMPOSE_ROUNDS", "3"))


def _propose(chosen: AIProvider, user: str) -> tuple[MoniFlow | None, str | None]:
    """One provider round. Returns (flow, None) on success, or (None, feedback)
    on RECOVERABLE malformed/truncated output (becomes a corrective retry).

    Raises ComposeUnavailable for a missing provider OR a transport/API error:
    an outage is not the model's JSON fault, so it must not be relabelled as bad
    JSON, must not burn a retry, and should surface as 503 not 422 (#106).
    """
    try:
        flow = chosen.structured(
            system=_SYSTEM, user=user, message="", schema=MoniFlow, max_tokens=_MAX_TOKENS
        )
        return flow, None  # type: ignore[return-value]
    except NotImplementedError as exc:
        raise ComposeUnavailable("composing flows needs an AI provider key") from exc
    except (ValidationError, ValueError) as exc:
        # Truncated / schema-invalid model output: recoverable, retry with a hint.
        log.info("composer.parse_failed", provider=chosen.name, error=type(exc).__name__)
        return None, (
            f"your output was not valid JSON for the schema ({type(exc).__name__}); "
            "return one complete, valid JSON object"
        )
    except Exception as exc:  # noqa: BLE001 - transport/API/network, not a JSON fault
        log.info("composer.provider_error", provider=chosen.name, error=type(exc).__name__)
        raise ComposeUnavailable(
            f"the AI provider is unavailable right now ({type(exc).__name__})"
        ) from exc


def compose_flow(message: str, *, provider: str | None = None) -> ComposeOutcome:
    """Generate -> verify -> refine -> refuse: the deterministic Moni loop (#106).

    Moni proposes; OUR code runs the analyzer and decides. A flow is returned only
    when the analyzer is clean after Apply-Fix. If the model declines the request
    as infeasible we refuse honestly (ComposeRefused); if it never converges within
    the round budget we refuse rather than ship an unclean flow (ComposeError). The
    exit is decided by the deterministic verifier, never by the model (D3).
    """
    catalog = default_catalog()
    chosen: AIProvider = select_provider(provider)
    base_user = f"{_catalog_prompt(catalog)}\n\nUser need: {message.strip()}"
    return _run_loop(chosen, catalog, base_user, message, keep_id=None)


def _serialize_flow(workflow: Workflow) -> str:
    """The current whiteboard flow, compact, for Moni to revise (#148)."""
    lines = ["Nodes (id | type | label):"]
    lines += [f"- {n.id} | {n.type} | {n.label or ''}" for n in workflow.nodes]
    lines.append("Edges (source -> target | kind):")
    lines += [f"- {e.source} -> {e.target} | {e.kind}" for e in workflow.edges]
    return "\n".join(lines)


def refine_flow(
    workflow: Workflow, instruction: str, *, provider: str | None = None
) -> ComposeOutcome:
    """Moni corrects the flow already on the whiteboard (#148, dev item 7).

    Same deterministic generate -> verify -> refuse loop as compose (#106); the
    only differences are the prompt (current flow + the user's instruction) and
    that the revised flow KEEPS the workflow's id, so the canvas updates in
    place. Safety stays the sole hard gate; an unclean revision never ships.
    """
    catalog = default_catalog()
    chosen: AIProvider = select_provider(provider)
    base_user = (
        f"{_catalog_prompt(catalog)}\n\n"
        "The user already has this flow on their whiteboard:\n"
        f"{_serialize_flow(workflow)}\n\n"
        f"Their instruction: {instruction.strip()}\n\n"
        "Revise the flow to follow the instruction. Keep what already works, "
        "change only what the instruction needs, and return the FULL revised "
        "flow (every node and edge), not a diff."
    )
    return _run_loop(chosen, catalog, base_user, instruction, keep_id=workflow.id)


def _run_loop(
    chosen: AIProvider,
    catalog: Catalog,
    base_user: str,
    fidelity_message: str,
    *,
    keep_id: str | None,
) -> ComposeOutcome:

    feedback = ""
    last_errors: list[str] = ["Moni could not produce a verifiably safe flow"]
    # Intent fidelity (#113): a clean-but-incomplete flow earns ONE corrective
    # round; the clean original is kept as a fallback so fidelity can only ever
    # improve the result, never lose it. Safety stays the sole hard gate.
    fallback: ComposeOutcome | None = None
    max_rounds = _MAX_ROUNDS
    round_no = 0
    while round_no < max_rounds:
        round_no += 1
        user = base_user + (
            f"\n\nYour previous attempt still had problems:\n{feedback}" if feedback else ""
        )
        flow, parse_error = _propose(chosen, user)
        if parse_error:
            feedback, last_errors = parse_error, [parse_error]
            continue
        if not flow.feasible:  # honest decline, not a fabricated flow
            raise ComposeRefused(
                flow.refusal.strip()
                or "That is not something I can build as a Monnify payment flow yet."
            )

        errors = _validate(flow, catalog)
        if errors:
            feedback = "\n".join(f"- {e}" for e in errors)
            last_errors = errors
            continue

        workflow = _to_workflow(flow, catalog, keep_id=keep_id)
        try:
            report_before = analyze(workflow, catalog)
            result = remediate_all(workflow, catalog)
            report_after = analyze(result.workflow, catalog)
        except Exception as exc:  # noqa: BLE001 - never surface as a raw 500 (#106)
            raise ComposeError([f"internal analysis error ({type(exc).__name__})"]) from exc

        if not report_after.findings:  # THE gate: clean, or we do not ship it
            outcome = ComposeOutcome(
                workflow=result.workflow,
                report_before=report_before,
                report_after=report_after,
                steps=result.steps,
                provider=chosen.name,
                explanation=flow.explanation,
            )
            gaps = intent_gaps(fidelity_message, result.workflow)
            if gaps and fallback is None:
                # Safe but not what was asked: keep it, ask Moni to cover the
                # gaps, and allow exactly one extra round for it (#113).
                fallback = outcome
                max_rounds = round_no + 1
                feedback = (
                    "The flow passed all safety checks BUT misses part of what "
                    "the user asked for:\n"
                    + "\n".join(f"- {g}" for g in gaps)
                    + "\nRevise the graph to cover this too."
                )
                log.info("composer.intent_gap", rounds=round_no, gaps=len(gaps))
                continue
            log.info(
                "composer.done",
                provider=chosen.name,
                rounds=round_no,
                nodes=len(workflow.nodes),
                findings_before=len(report_before.findings),
                steps=len(result.steps),
                fidelity_round=fallback is not None,
            )
            return outcome

        # Still unclean after Apply-Fix: feed the exact residual findings back and
        # let Moni revise. Structured diagnostics-as-feedback is what converges.
        feedback = (
            "After auto-fix the analyzer STILL flags these; change the graph to "
            "resolve them:\n"
            + "\n".join(f"- [{f.rule_id}] {f.message}" for f in report_after.findings)
        )
        last_errors = [f"{f.rule_id}: {f.message}" for f in report_after.findings]
        log.info(
            "composer.round_unclean",
            provider=chosen.name,
            round=round_no,
            remaining=len(report_after.findings),
        )

    if fallback is not None:
        # The fidelity retry did not produce something better; the original
        # clean flow is still safe and still useful - return it (#113).
        log.info("composer.fidelity_fallback", provider=chosen.name)
        return fallback
    # Round budget exhausted without a clean flow: refuse, never ship it (#106).
    raise ComposeError(last_errors)

"""Intent → IR with canned templates + analyzer gate (#15 Slice B, D16)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from monnify_studio.analysis import Report, analyze
from monnify_studio.fixtures import safe_marketplace, unsafe_marketplace
from monnify_studio.ir.models import Workflow
from monnify_studio.providers.base import Catalog

_SAFE_HINTS = re.compile(
    r"\b(safe|secure|correct|idempoten|verif|signature|payout.?after|"
    r"fulfilment|ledger.?hold)\b",
    re.IGNORECASE,
)
_UNSAFE_HINTS = re.compile(
    r"\b(unsafe|naive|broken|insecure|quick.?hack|skip.?verif)\b",
    re.IGNORECASE,
)
_MARKETPLACE = re.compile(
    r"\b(marketplace|split.?pay|vendor.?payout|escrow|multi.?vendor)\b",
    re.IGNORECASE,
)


@dataclass
class DesignResult:
    workflow: Workflow | None
    analysis: Report | None
    source: str = "canned"
    template_id: str | None = None
    clarifications: list[str] = field(default_factory=list)
    summary: str = ""


def match_template(intent: str, *, prefer_safe: bool = False) -> str | None:
    """Map free text to a hero fixture id, or None if we need clarifications."""
    text = intent.strip()
    if not text:
        return None
    if not _MARKETPLACE.search(text) and not prefer_safe:
        # Still accept generic marketplace language via "payment" + "seller"
        if not re.search(r"\b(seller|vendor|platform.?fee|checkout)\b", text, re.I):
            return None
    if prefer_safe or _SAFE_HINTS.search(text):
        return "marketplace-safe"
    if _UNSAFE_HINTS.search(text):
        return "marketplace-unsafe"
    # Default demo path: show the unsafe hero so Review has teeth.
    return "marketplace-unsafe"


def _build(template_id: str) -> Workflow:
    if template_id == "marketplace-safe":
        return safe_marketplace()
    return unsafe_marketplace()


def design_from_intent(
    intent: str,
    catalog: Catalog,
    *,
    apply_safe: bool = False,
) -> DesignResult:
    """Produce a validated IR and auto-run the analyzer (never skip D3 gate)."""
    template_id = match_template(intent, prefer_safe=apply_safe)
    if template_id is None:
        return DesignResult(
            workflow=None,
            analysis=None,
            source="canned",
            clarifications=[
                "Is this a marketplace (buyers pay, sellers get paid later)?",
                "Should payout wait for fulfilment, or settle immediately?",
                "Do you need the unsafe teaching graph or the remediated safe graph?",
            ],
            summary=(
                "I need a bit more product context before emitting IR. "
                "Answer the clarifications, or try: "
                "“marketplace with payout after fulfilment (safe)”."
            ),
        )

    workflow = _build(template_id)
    # Fresh id so Apply does not silently overwrite a hero the user is editing
    # unless they choose to — frontend can still replace canvas content.
    workflow.id = f"ai-{template_id}"
    workflow.description = f"Designed from intent: {intent.strip()[:200]}"
    analysis = analyze(workflow, catalog)
    finding_ids = ", ".join(sorted({f.rule_id for f in analysis.findings})) or "none"
    summary = (
        f"Loaded canned template `{template_id}` (source=canned). "
        f"Analyzer findings: {finding_ids}. "
        "Apply to canvas to inspect, then use Apply Fix if needed."
    )
    return DesignResult(
        workflow=workflow,
        analysis=analysis,
        source="canned",
        template_id=template_id,
        summary=summary,
    )

"""Moni: intent to vetted template (#15, D16, D18).

The floor of the agent. Moni maps a seller's plain-language description onto one
of the vetted templates and extracts config. She never designs a flow; the
templates are already analyzer-clean, and the caller instantiates them through
the same from-template path everything else uses.
"""

from __future__ import annotations

from ..templates import list_templates
from .providers import AIProvider, select_provider
from .schema import MoniIntent

_SYSTEM = (
    "You are Moni, an assistant for Monnify Studio. Map the user's description of "
    "their business need onto exactly one available template, and extract config "
    "if present. You NEVER design payment logic; you only pick a vetted template. "
    "If nothing fits, set template_id to 'unknown' and ask one short clarifying "
    "question. Explain protections in plain, non-technical language."
)


def _template_menu() -> str:
    lines = [f"- {t.id}: {t.title} (for {t.persona})" for t in list_templates()]
    return "Available templates:\n" + "\n".join(lines) + "\n- unknown: nothing fits"


def classify_intent(message: str, *, provider: str | None = None) -> tuple[MoniIntent, str]:
    """Return (intent, provider_name). template_id is coerced to a known id or 'unknown'."""
    chosen: AIProvider = select_provider(provider)
    user = f"{_template_menu()}\n\nUser: {message.strip()}"
    try:
        intent = chosen.structured(system=_SYSTEM, user=user, message=message)
    except Exception as exc:  # noqa: BLE001 - never let a provider error break Chat (D11)
        from .providers import KeywordFallback

        intent = KeywordFallback().structured(system=_SYSTEM, user=user, message=message)
        return _sanitize(intent), f"{chosen.name}->keyword ({type(exc).__name__})"
    return _sanitize(intent), chosen.name


def _sanitize(intent: MoniIntent) -> MoniIntent:
    """Guardrail: the model may only name a real template; clamp everything else."""
    known = {t.id for t in list_templates()} | {"unknown"}
    if intent.template_id not in known:
        intent.template_id = "unknown"
    intent.confidence = max(0.0, min(1.0, intent.confidence))
    if intent.price_ngn is not None and intent.price_ngn < 0:
        intent.price_ngn = None
    return intent

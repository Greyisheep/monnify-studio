"""Product templates: ready-made, analyzer-clean payment products (#51, D17).

A template is a curated Workflow builder plus the storefront metadata the
picker shows ("What do you want to set up?"). Templates are the D17 bridge:
the seller picks a product in plain language; what she actually gets is our
typed IR with every safety node already in place.

Registry pattern mirrors the provider catalog (D13): adding a template is one
module + one registry entry, never an engine change.
"""

from __future__ import annotations

from typing import Callable

from pydantic import BaseModel

from ..ir.models import Workflow
from .sell_online import sell_online


class TemplateInfo(BaseModel):
    """What the picker renders. Kept flat and frontend-friendly (#55 contract)."""

    id: str
    title: str
    persona: str
    description: str


class TemplateDef(BaseModel):
    info: TemplateInfo
    builder: Callable[[], Workflow]


_TEMPLATES: dict[str, TemplateDef] = {
    "sell-online": TemplateDef(
        info=TemplateInfo(
            id="sell-online",
            title="Sell online with verified payments",
            persona="Small business selling on Instagram / WhatsApp",
            description=(
                "A payment link plus an orders dashboard. An order is only marked "
                "paid after Monnify confirms the money server-side, so fake credit "
                "alerts and doctored transfer screenshots never release goods."
            ),
        ),
        builder=sell_online,
    ),
}


def list_templates() -> list[TemplateInfo]:
    return [t.info for t in _TEMPLATES.values()]


def get_template(template_id: str) -> TemplateDef | None:
    return _TEMPLATES.get(template_id)


def build_template(template_id: str) -> Workflow:
    """Fresh Workflow instance for a template. Raises KeyError if unknown."""
    template = _TEMPLATES.get(template_id)
    if template is None:
        raise KeyError(template_id)
    return template.builder()


__all__ = [
    "TemplateDef",
    "TemplateInfo",
    "build_template",
    "get_template",
    "list_templates",
]

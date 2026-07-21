"""Artifact generation: turn a workflow into the seller's product (#52, D17).

The generator consumes the sell_online IR plus config vars (business name,
product, price, accent color) and emits the seller-facing artifact: a payment
page and an orders dashboard. Generation is deterministic Jinja2 templating
(no free-form LLM in the financial path, per Principle 5 / D3): what the
canvas shows is what the artifact does.

The skin is one stylesheet (`templates/skin.css.j2`) so design (#59 item 1)
can restyle without touching structure or behavior.
"""

from .generator import (
    ArtifactConfig,
    CatalogItem,
    FlowFeatures,
    GeneratedArtifact,
    artifact_store,
    flow_features,
    generate_artifact,
    render_contribute_page,
    render_invoice_page,
    render_storefront,
)

__all__ = [
    "render_contribute_page",
    "render_invoice_page",
    "render_storefront",
    "CatalogItem",
    "FlowFeatures",
    "flow_features",
    "ArtifactConfig",
    "GeneratedArtifact",
    "artifact_store",
    "generate_artifact",
]

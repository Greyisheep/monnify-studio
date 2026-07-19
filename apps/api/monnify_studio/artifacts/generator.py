"""Deterministic artifact generator + in-memory artifact store (#52, D17).

Flow: `generate_artifact(workflow, config)` validates that the workflow carries
the safety spine the artifact's promise depends on (verification before
fulfilment), renders the pages, and registers the artifact so the API can serve
`GET /preview/{artifact_id}` for the Preview iframe (#55 contract).

Orders shown in the dashboard come from the orders store once #53 lands; until
then the dashboard renders the empty state.
"""

from __future__ import annotations

from uuid import uuid4

from jinja2 import Environment, PackageLoader, select_autoescape
from pydantic import BaseModel, Field, field_validator

from ..analysis import analyze
from ..ir.models import Workflow
from ..observability import get_logger
from ..providers import default_catalog

log = get_logger("artifacts")

_env = Environment(
    loader=PackageLoader("monnify_studio.artifacts", "templates"),
    autoescape=select_autoescape(["html"]),
)


class ArtifactConfig(BaseModel):
    """The only editing surface the seller gets (D17 guardrail: config vars, not a builder)."""

    business_name: str = "My Business"
    product_name: str = "Product"
    price_ngn: int = Field(default=5000, ge=100)
    accent_color: str = "#0f6b57"
    tagline: str = "Pay securely. Every order is verified with Monnify."
    # Seller branding (#61): hosted image URL, or a data URL produced client-side
    # from a file upload (#55). Empty keeps the letter mark. Capped so a data
    # URL stays a reasonable logo, not an accidental video.
    logo_url: str = Field(default="", max_length=400_000)

    @field_validator("logo_url")
    @classmethod
    def _safe_logo_scheme(cls, v: str) -> str:
        if v and not (v.startswith("https://") or v.startswith("data:image/")):
            raise ValueError("logo_url must start with https:// or data:image/")
        return v


class GeneratedArtifact(BaseModel):
    artifact_id: str
    workflow_id: str
    config: ArtifactConfig
    payment_page_html: str
    dashboard_html: str
    skin_css: str


class ArtifactStore:
    """In-memory registry keyed by artifact id (Postgres later, D5)."""

    def __init__(self) -> None:
        self._artifacts: dict[str, GeneratedArtifact] = {}

    def put(self, artifact: GeneratedArtifact) -> None:
        self._artifacts[artifact.artifact_id] = artifact

    def get(self, artifact_id: str) -> GeneratedArtifact | None:
        return self._artifacts.get(artifact_id)


artifact_store = ArtifactStore()


def _require_verified_spine(workflow: Workflow) -> None:
    """The artifact's promise is "paid means verified"; refuse to generate from a
    workflow whose graph cannot keep that promise (#52, the D17 envelope)."""
    report = analyze(workflow, default_catalog())
    criticals = [f for f in report.findings if f.severity.value == "critical"]
    if criticals:
        rules = ", ".join(sorted({f.rule_id for f in criticals}))
        raise ValueError(
            f"workflow has critical findings ({rules}); fix them before generating"
        )


def generate_artifact(workflow: Workflow, config: ArtifactConfig) -> GeneratedArtifact:
    _require_verified_spine(workflow)
    artifact_id = f"art_{uuid4().hex[:12]}"
    context = {
        "config": config,
        "workflow_id": workflow.id,
        "artifact_id": artifact_id,
        "price_display": f"{config.price_ngn:,}",
    }
    artifact = GeneratedArtifact(
        artifact_id=artifact_id,
        workflow_id=workflow.id,
        config=config,
        payment_page_html=_env.get_template("payment_page.html.j2").render(**context),
        dashboard_html=_env.get_template("dashboard.html.j2").render(**context),
        skin_css=_env.get_template("skin.css.j2").render(**context),
    )
    artifact_store.put(artifact)
    log.info(
        "artifact.generated", artifact_id=artifact_id, workflow=workflow.id,
        business=config.business_name,
    )
    return artifact

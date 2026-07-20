"""Deterministic artifact generator + in-memory artifact store (#52, D17).

Flow: `generate_artifact(workflow, config)` validates that the workflow carries
the safety spine the artifact's promise depends on (verification before
fulfilment), renders the pages, and registers the artifact so the API can serve
`GET /preview/{artifact_id}` for the Preview iframe (#55 contract).

Orders shown in the dashboard come from the orders store once #53 lands; until
then the dashboard renders the empty state.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from jinja2 import Environment, PackageLoader, select_autoescape
from pydantic import BaseModel, Field, field_validator

from ..analysis import analyze
from ..ir.types import CapabilityTag as T
from ..ir.models import Workflow
from ..observability import get_logger
from ..providers import default_catalog

log = get_logger("artifacts")

# Node types that collect money in (no capability tag distinguishes collection
# yet, so v1 detects by type; everything else below is tag-driven, D13).
_COLLECTING_TYPES = {"monnify.initialize_transaction", "monnify.create_reserved_account"}


class FlowFeatures(BaseModel):
    """What a flow can do, detected from its graph: drives which dashboard
    sections exist, so ANY composed idea ends in a product (#78, D17)."""

    collects: bool = False
    has_invoices: bool = False
    has_ledger: bool = False
    has_notify: bool = False
    has_payout: bool = False


def flow_features(workflow: Workflow) -> FlowFeatures:
    catalog = default_catalog()
    features = FlowFeatures()
    for node in workflow.nodes:
        tags = catalog.effective_tags(node)
        if node.type in _COLLECTING_TYPES:
            features.collects = True
        if node.type == "monnify.create_invoice":
            features.has_invoices = True
        if T.MUTATES_LEDGER in tags:
            features.has_ledger = True
        if node.type.startswith("app.notify"):  # app.notify + app.notify_whatsapp (#113)
            features.has_notify = True
        if T.BENEFICIARY_TRANSFER in tags or T.MONEY_MOVEMENT in tags:
            features.has_payout = True
    return features

_env = Environment(
    loader=PackageLoader("monnify_studio.artifacts", "templates"),
    autoescape=select_autoescape(["html"]),
)


class CatalogItem(BaseModel):
    """One thing the seller sells: the whole 'setup' a non-technical seller does
    is type a name and a price, one row at a time (#91, D17)."""

    id: str = Field(default_factory=lambda: uuid4().hex[:8])
    name: str
    price_ngn: Decimal = Field(ge=0)  # exact to the kobo (D21)


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
    # The seller's price list for the self-serve shop link (#91). Empty means the
    # shop offers the single product_name/price_ngn above, so every shop has
    # something to buy.
    catalog: list[CatalogItem] = Field(default_factory=list)

    def shop_items(self) -> list[CatalogItem]:
        """What the storefront offers: the catalog, or the single product as a
        one-item fallback so a bare config still has a buyable shop (#91)."""
        if self.catalog:
            return self.catalog
        return [CatalogItem(id="default", name=self.product_name, price_ngn=Decimal(self.price_ngn))]

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


def render_storefront(artifact: "GeneratedArtifact") -> str:
    """The buyer-facing shop: the seller's items with add/qty, one shareable
    link a seller drops in a WhatsApp bio or a printed QR (#91)."""
    items = [
        {"id": it.id, "name": it.name, "price": f"{it.price_ngn:,.2f}", "price_raw": str(it.price_ngn)}
        for it in artifact.config.shop_items()
    ]
    return _env.get_template("storefront.html.j2").render(
        config=artifact.config,
        artifact_id=artifact.artifact_id,
        items=items,
    )


def render_invoice_page(artifact: "GeneratedArtifact", invoice) -> str:
    """Buyer-facing page for one invoice, rendered to a document (#85, #87).

    Laid out like a real invoice (Dockie/Carlofty reference): number, issued and
    due dates, from/billed-to blocks, a line-item table, a totals stack, and
    payment info. Due date is a courteous default (issued + 7 days).
    """
    from datetime import timedelta

    issued = invoice.created_at
    due = issued + timedelta(days=7)
    # Formatted rows: multi-line when the buyer assembled it in a shop (#91),
    # else a single line so a plain invoice still reads as a document.
    if invoice.line_items:
        rows = [
            {
                "name": li.name,
                "qty": li.qty,
                "rate": f"{li.unit_amount:,.2f}",
                "amount": f"{li.line_total:,.2f}",
            }
            for li in invoice.line_items
        ]
    else:
        rows = [
            {
                "name": invoice.description or invoice.product,
                "qty": 1,
                "rate": f"{invoice.amount:,.2f}",
                "amount": f"{invoice.amount:,.2f}",
            }
        ]
    return _env.get_template("invoice_page.html.j2").render(
        config=artifact.config,
        artifact_id=artifact.artifact_id,
        invoice=invoice,
        amount_display=f"{invoice.amount:,.2f}",
        line_rows=rows,
        issued_display=issued.strftime("%d %B, %Y"),
        due_display=due.strftime("%d %B, %Y"),
    )


def generate_artifact(workflow: Workflow, config: ArtifactConfig) -> GeneratedArtifact:
    _require_verified_spine(workflow)
    artifact_id = f"art_{uuid4().hex[:12]}"
    context = {
        "config": config,
        "workflow_id": workflow.id,
        "workflow_name": workflow.name,
        "artifact_id": artifact_id,
        "price_display": f"{config.price_ngn:,}",
        "features": flow_features(workflow),  # section switches (#78)
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

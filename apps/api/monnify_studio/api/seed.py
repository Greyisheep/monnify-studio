"""Demo data on boot (#116): a judge's first click lands on something alive.

Cloud Run + in-memory stores means a restart wipes state; until Postgres (#84)
the API seeds one complete demo business at boot: a workflow, its generated
shop + dashboard, an unpaid and a settled invoice, and a practice run so the
activity and notification feeds have life. Idempotent; runs only when
STUDIO_SEED_DEMO=1 (set by the deploy script), so tests and local dev stay
pristine.
"""

from __future__ import annotations

from decimal import Decimal

from ..artifacts import ArtifactConfig, CatalogItem, generate_artifact
from ..executor import MockAdapter, run_workflow
from ..observability import get_logger
from ..orders import OrderStatus, orders_service
from ..store import store
from ..templates import build_template

log = get_logger("seed")

WORKFLOW_ID = "demo-invoice-shop"


def seed_demo() -> str | None:
    """Seed the demo business; returns the artifact id, or None if already done."""
    if store.get(WORKFLOW_ID) is not None:
        return None  # already seeded (idempotent across reloads)

    wf = build_template("invoice")
    wf.id = WORKFLOW_ID
    wf.name = "Mama Nkechi Foods - Invoices & Shop"
    store.save(wf)

    artifact = generate_artifact(
        wf,
        ArtifactConfig(
            business_name="Mama Nkechi Foods",
            tagline="Party jollof, small chops & more - Lagos.",
            product_name="Party jollof (per cooler)",
            price_ngn=45000,
            catalog=[
                CatalogItem(id="jollof", name="Party jollof (per cooler)", price_ngn=Decimal(45000)),
                CatalogItem(id="chops", name="Small chops tray", price_ngn=Decimal(12000)),
                CatalogItem(id="moimoi", name="Moi moi (dozen)", price_ngn=Decimal(6000)),
            ],
        ),
    )

    orders_service.create(
        reference="INV-DEMO-A",
        artifact_id=artifact.artifact_id,
        product="Small chops tray",
        amount=Decimal("12000"),
        workflow_id=wf.id,
        kind="invoice",
        customer="Chidi Okafor",
        description="Small chops tray x1",
    )
    settled = orders_service.create(
        reference="INV-DEMO-B",
        artifact_id=artifact.artifact_id,
        product="Party jollof (per cooler)",
        amount=Decimal("45000"),
        workflow_id=wf.id,
        kind="invoice",
        customer="Adaeze Events",
        description="Party jollof (per cooler) x1",
    )
    # Server-side seed, not a client claim: one invoice shown settled so the
    # dashboard demonstrates both states a seller will meet. Real invoices still
    # only ever verify against Monnify (#53); this bypass exists only here.
    settled.status = OrderStatus.VERIFIED
    settled.note = "Verified with Monnify (demo data)"

    run_workflow(wf, adapter=MockAdapter())  # fills activity + notification feeds
    log.info(
        "seed.demo",
        workflow=wf.id,
        artifact=artifact.artifact_id,
        dashboard=f"/preview/{artifact.artifact_id}/dashboard",
    )
    return artifact.artifact_id

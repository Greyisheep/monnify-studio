"""HTTP surface for the Studio canvas: IR load/edit, analyze, typed wiring, Apply-Fix.

Run from apps/api:
    .venv/bin/uvicorn monnify_studio.api.main:app --reload --port 8010 --host 127.0.0.1
"""

from __future__ import annotations

import asyncio
import json

from decimal import Decimal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from monnify_studio.ai import (
    ComposeError,
    ComposeUnavailable,
    Source,
    classify_intent,
    compose_flow,
    explain,
)
from monnify_studio.analysis import Report, analyze
from monnify_studio.artifacts import (
    ArtifactConfig,
    CatalogItem,
    artifact_store,
    generate_artifact,
    render_invoice_page,
    render_storefront,
)
from monnify_studio.credentials import (
    CredentialStatus,
    MonnifyCredentials,
    credential_store,
)
from monnify_studio.integrations.monnify import MonnifyError, MonnifySandboxClient
from monnify_studio.money import money
from monnify_studio.notifications import (
    Notification,
    email_notifier,
    notification_log,
    whatsapp_notifier,
)
from monnify_studio.orders import LineItem, Order, orders_service
from monnify_studio.executor import (
    ExecutionEvent,
    ExecutionRun,
    MockAdapter,
    RunStatus,
    execution_store,
    run_workflow,
)
from monnify_studio.fixtures import safe_marketplace, unsafe_marketplace
from monnify_studio.ir.models import Workflow
from monnify_studio.ir.typing import control_edge_type_hint, validate_port_connection
from monnify_studio.observability import (
    configure_observability,
    correlation,
    get_logger,
    instrument_fastapi,
    new_id,
)
from monnify_studio.providers import default_catalog
from monnify_studio.remediation import apply_fix, remediate_all
from monnify_studio.remediation.engine import RemediationStep
from monnify_studio.store import store
from monnify_studio.templates import TemplateInfo, build_template, list_templates

HERO_FACTORIES = {
    "marketplace-unsafe": unsafe_marketplace,
    "marketplace-safe": safe_marketplace,
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    studio_env: str = "development"
    allow_production_execution: bool = False
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"


settings = Settings()
catalog = default_catalog()

configure_observability(console_spans=False)  # structured logs + tracing (D15, #39)
log = get_logger("api")

app = FastAPI(
    title="Monnify Studio API",
    version="0.1.0",
    description=(
        "IR + architecture review + remediation + execution-trace surface "
        "for the Studio canvas (#8)."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _observe(request, call_next):
    """Tag every request with a correlation id and log it (redacted) (#39, D15)."""
    with correlation(request_id=new_id("req")):
        response = await call_next(request)
        log.info(
            "api.request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
        )
        return response


try:
    instrument_fastapi(app)  # per-request trace spans, propagated to adapters
except ImportError:
    log.warning("otel.fastapi.not_installed")

log.info("api.ready", env=settings.studio_env)


class PortMeta(BaseModel):
    name: str
    type: str
    required: bool = True
    description: str = ""


class NodeMeta(BaseModel):
    type: str
    category: str
    title: str
    description: str = ""
    inputs: list[PortMeta] = Field(default_factory=list)
    outputs: list[PortMeta] = Field(default_factory=list)


class WorkflowPayload(BaseModel):
    workflow: Workflow
    node_types: dict[str, NodeMeta] = Field(default_factory=dict)


class TypeCheckRequest(BaseModel):
    source_type: str
    target_type: str
    source_port: str | None = None
    target_port: str | None = None


class TypeCheckResult(BaseModel):
    ok: bool
    message: str = ""


class RemediateRequest(BaseModel):
    workflow: Workflow
    rule_id: str | None = None  # None / "ALL" → remediate_all
    finding_path: list[str] = Field(default_factory=list)


class GraphDiff(BaseModel):
    added_nodes: list[str] = Field(default_factory=list)
    removed_nodes: list[str] = Field(default_factory=list)
    added_edges: list[str] = Field(default_factory=list)
    removed_edges: list[str] = Field(default_factory=list)
    steps: list[RemediationStep] = Field(default_factory=list)


class RemediateResult(BaseModel):
    workflow: Workflow
    node_types: dict[str, NodeMeta]
    analysis: Report
    diff: GraphDiff


class StartExecutionRequest(BaseModel):
    workflow: Workflow
    adapter: str = "mock"  # mock today; monnify later (#9)


class StartExecutionResponse(BaseModel):
    run: ExecutionRun
    event_count: int


def _meta_from_def(defn) -> NodeMeta:
    return NodeMeta(
        type=defn.type,
        category=defn.category.value,
        title=defn.title,
        description=defn.description,
        inputs=[
            PortMeta(
                name=p.name, type=p.type.value, required=p.required, description=p.description
            )
            for p in defn.inputs
        ],
        outputs=[
            PortMeta(
                name=p.name, type=p.type.value, required=p.required, description=p.description
            )
            for p in defn.outputs
        ],
    )


def _catalog_metas() -> dict[str, NodeMeta]:
    return {t: _meta_from_def(catalog.resolve(t)) for t in catalog.types()}


def _enrich(workflow: Workflow) -> WorkflowPayload:
    metas = _catalog_metas()
    for node in workflow.nodes:
        if node.type not in metas:
            metas[node.type] = NodeMeta(
                type=node.type, category="application", title=node.type
            )
    return WorkflowPayload(workflow=workflow, node_types=metas)


def _graph_diff(
    before: Workflow, after: Workflow, steps: list[RemediationStep] | None = None
) -> GraphDiff:
    before_nodes = {n.id for n in before.nodes}
    after_nodes = {n.id for n in after.nodes}
    before_edges = {f"{e.source}->{e.target}:{e.kind}" for e in before.edges}
    after_edges = {f"{e.source}->{e.target}:{e.kind}" for e in after.edges}
    return GraphDiff(
        added_nodes=sorted(after_nodes - before_nodes),
        removed_nodes=sorted(before_nodes - after_nodes),
        added_edges=sorted(after_edges - before_edges),
        removed_edges=sorted(before_edges - after_edges),
        steps=list(steps or []),
    )


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "env": settings.studio_env,
        "allow_production_execution": settings.allow_production_execution,
    }


@app.get("/catalog", response_model=dict[str, NodeMeta])
def get_catalog() -> dict[str, NodeMeta]:
    return _catalog_metas()


class AssistantRequest(BaseModel):
    message: str
    provider: str | None = None  # anthropic | openai | google; None = auto


class AssistantResponse(BaseModel):
    template_id: str
    confidence: float
    config: dict
    explanation: str
    clarifying_question: str
    provider: str


@app.post("/assistant/intent", response_model=AssistantResponse)
def assistant_intent(body: AssistantRequest) -> AssistantResponse:
    """Moni maps a plain-language need onto a vetted template (#15, D16, D18).

    Moni never designs a flow; the frontend takes template_id + config into the
    existing from-template + generate path (human stays in the loop for money).
    """
    with correlation(request_id=new_id("moni")):
        intent, provider = classify_intent(body.message, provider=body.provider)
        config = {
            k: v
            for k, v in {
                "business_name": intent.business_name,
                "product_name": intent.product_name,
                "price_ngn": intent.price_ngn,
            }.items()
            if v
        }
        log.info("assistant.intent", template=intent.template_id, provider=provider)
        return AssistantResponse(
            template_id=intent.template_id,
            confidence=intent.confidence,
            config=config,
            explanation=intent.explanation,
            clarifying_question=intent.clarifying_question,
            provider=provider,
        )


class ComposeResponse(BaseModel):
    workflow: Workflow
    node_types: dict[str, NodeMeta]
    analysis: Report  # final state, after Apply-Fix
    findings_caught: list[str] = Field(default_factory=list)  # rule ids Moni tripped
    steps: list[RemediationStep] = Field(default_factory=list)
    provider: str
    explanation: str = ""


@app.post("/assistant/compose", response_model=ComposeResponse)
def assistant_compose(body: AssistantRequest) -> ComposeResponse:
    """Moni composes a full flow from the catalog; the analyzer disposes (#15, D18).

    The result is saved to the store and returned in the same shape the canvas
    already loads, so it appears as a normal, fully editable workflow.
    """
    with correlation(request_id=new_id("moni")):
        try:
            outcome = compose_flow(body.message, provider=body.provider)
        except ComposeUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from None
        except ComposeError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Moni could not produce a valid flow: {'; '.join(exc.errors)}",
            ) from None
        saved = store.save(outcome.workflow)
        payload = _enrich(saved)
        log.info(
            "assistant.compose",
            workflow=saved.id,
            provider=outcome.provider,
            caught=len(outcome.report_before.findings),
            remaining=len(outcome.report_after.findings),
        )
        return ComposeResponse(
            workflow=payload.workflow,
            node_types=payload.node_types,
            analysis=outcome.report_after,
            findings_caught=[f.rule_id for f in outcome.report_before.findings],
            steps=outcome.steps,
            provider=outcome.provider,
            explanation=outcome.explanation,
        )


class ExplainRequest(BaseModel):
    question: str
    node_type: str | None = None  # catalog key the user is asking about
    workflow_id: str | None = None  # optional: adds the flow as context
    provider: str | None = None


class ExplainResponse(BaseModel):
    answer: str
    sources: list[Source] = Field(default_factory=list)  # real doc refs, never model-made
    provider: str


@app.post("/assistant/explain", response_model=ExplainResponse)
def assistant_explain(body: ExplainRequest) -> ExplainResponse:
    """Ask Moni "why" while building; answers cite the real Monnify docs (#75, D20)."""
    with correlation(request_id=new_id("why")):
        summary = ""
        if body.workflow_id:
            wf = store.get(body.workflow_id)
            if wf is not None:
                labels = ", ".join(n.label or n.type for n in wf.nodes[:14])
                summary = f"'{wf.name}' with steps: {labels}"
        try:
            result, provider_used = explain(
                body.question,
                node_type=body.node_type,
                workflow_summary=summary,
                provider=body.provider,
            )
        except KeyError:
            raise HTTPException(
                status_code=404, detail=f"unknown node type: {body.node_type}"
            ) from None
        log.info("assistant.explain", node=body.node_type, provider=provider_used)
        return ExplainResponse(
            answer=result.answer, sources=result.sources, provider=provider_used
        )


@app.get("/templates", response_model=list[TemplateInfo])
def get_templates() -> list[TemplateInfo]:
    """Product templates for the picker ("What do you want to set up?") (#51, D17)."""
    return list_templates()


@app.post("/workflows/from-template/{template_id}", response_model=WorkflowPayload)
def create_from_template(template_id: str) -> WorkflowPayload:
    """Instantiate a template as a fresh, editable workflow (#51, #55 contract).

    Each pick gets a unique workflow id so two sessions never clobber each
    other in the store; the canvas then works with it like any workflow.
    """
    try:
        wf = build_template(template_id)
    except KeyError:
        raise HTTPException(
            status_code=404, detail=f"unknown template: {template_id}"
        ) from None
    wf.id = f"{template_id}-{new_id('wf').split('_')[1]}"
    saved = store.save(wf)
    log.info("api.template.instantiated", template=template_id, workflow=saved.id)
    return _enrich(saved)


@app.get("/workflows")
def list_workflows() -> list[dict]:
    return store.list_summaries()


@app.post("/workflows/{workflow_id}/reset", response_model=WorkflowPayload)
def reset_workflow(workflow_id: str) -> WorkflowPayload:
    """Restore a hero fixture to its canonical seed (for demo toggles)."""
    factory = HERO_FACTORIES.get(workflow_id)
    if factory is None:
        raise HTTPException(status_code=404, detail=f"unknown hero: {workflow_id}")
    wf = store.reset(workflow_id, factory())
    return _enrich(wf)


@app.get("/workflows/{workflow_id}", response_model=WorkflowPayload)
def get_workflow(workflow_id: str) -> WorkflowPayload:
    wf = store.get(workflow_id)
    if wf is None:
        raise HTTPException(status_code=404, detail=f"unknown workflow: {workflow_id}")
    return _enrich(wf)


@app.get("/workflows/{workflow_id}/versions")
def list_versions(workflow_id: str) -> dict:
    versions = store.list_versions(workflow_id)
    if not versions:
        raise HTTPException(status_code=404, detail=f"unknown workflow: {workflow_id}")
    return {"id": workflow_id, "versions": versions}


@app.put("/workflows/{workflow_id}", response_model=WorkflowPayload)
def put_workflow(workflow_id: str, workflow: Workflow) -> WorkflowPayload:
    if workflow.id != workflow_id:
        workflow.id = workflow_id
    saved = store.save(workflow)
    return _enrich(saved)


@app.get("/workflows/{workflow_id}/analysis", response_model=Report)
def get_analysis(workflow_id: str) -> Report:
    wf = store.get(workflow_id)
    if wf is None:
        raise HTTPException(status_code=404, detail=f"unknown workflow: {workflow_id}")
    return analyze(wf, catalog)


@app.post("/analyze", response_model=Report)
def analyze_workflow(workflow: Workflow) -> Report:
    return analyze(workflow, catalog)


@app.post("/validate-connection", response_model=TypeCheckResult)
def validate_connection(body: TypeCheckRequest) -> TypeCheckResult:
    if body.source_port and body.target_port:
        ok, msg = validate_port_connection(
            catalog,
            body.source_type,
            body.source_port,
            body.target_type,
            body.target_port,
        )
    else:
        ok, msg = control_edge_type_hint(catalog, body.source_type, body.target_type)
    return TypeCheckResult(ok=ok, message=msg)


@app.post("/remediate", response_model=RemediateResult)
def remediate(body: RemediateRequest) -> RemediateResult:
    """Apply-Fix via the shared remediation engine (#6), then re-analyze."""
    before = body.workflow
    rule = (body.rule_id or "ALL").upper()

    if rule == "ALL":
        result = remediate_all(before, catalog)
        after = result.workflow
        steps = result.steps
    else:
        report = analyze(before, catalog)
        finding = next((f for f in report.findings if f.rule_id == rule), None)
        if finding is None:
            raise HTTPException(
                status_code=400,
                detail=f"no open finding for rule {rule} on this workflow",
            )
        after, step = apply_fix(before, finding, catalog)
        steps = [step]

    after.version = before.version + 1
    saved = store.save(after)
    payload = _enrich(saved)
    analysis = analyze(saved, catalog)
    return RemediateResult(
        workflow=payload.workflow,
        node_types=payload.node_types,
        analysis=analysis,
        diff=_graph_diff(before, saved, steps),
    )


class GenerateRequest(BaseModel):
    config: ArtifactConfig = Field(default_factory=ArtifactConfig)


class GenerateResponse(BaseModel):
    artifact_id: str
    preview_url: str
    dashboard_url: str


@app.post("/workflows/{workflow_id}/generate", response_model=GenerateResponse)
def generate(workflow_id: str, body: GenerateRequest) -> GenerateResponse:
    """Generate the seller artifact from a workflow (#52, D17, #55 contract).

    Refuses workflows with critical findings: the artifact's promise is
    "paid means verified", so the graph must be able to keep it.
    """
    wf = store.get(workflow_id)
    if wf is None:
        raise HTTPException(status_code=404, detail=f"unknown workflow: {workflow_id}")
    try:
        artifact = generate_artifact(wf, body.config)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return GenerateResponse(
        artifact_id=artifact.artifact_id,
        preview_url=f"/preview/{artifact.artifact_id}",
        dashboard_url=f"/preview/{artifact.artifact_id}/dashboard",
    )


def _artifact_or_404(artifact_id: str):
    artifact = artifact_store.get(artifact_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail=f"unknown artifact: {artifact_id}")
    return artifact


@app.get("/preview/{artifact_id}", response_class=HTMLResponse)
def preview_payment_page(artifact_id: str) -> HTMLResponse:
    return HTMLResponse(_artifact_or_404(artifact_id).payment_page_html)


@app.get("/preview/{artifact_id}/dashboard", response_class=HTMLResponse)
def preview_dashboard(artifact_id: str) -> HTMLResponse:
    return HTMLResponse(_artifact_or_404(artifact_id).dashboard_html)


@app.get("/preview/{artifact_id}/skin.css")
def preview_skin(artifact_id: str) -> Response:
    return Response(_artifact_or_404(artifact_id).skin_css, media_type="text/css")


@app.post("/preview/{artifact_id}/pay")
def preview_pay(artifact_id: str) -> dict:
    """Create a REAL sandbox checkout for the artifact's product (#52).

    Order persistence and verification arrive with #53; this returns the live
    checkout so the Pay button is never a mock.
    """
    artifact = _artifact_or_404(artifact_id)
    reference = f"ord-{uuid4().hex[:10]}"
    # Their keys, their money: collect to the workflow's own account (#68, D19).
    resolved = credential_store.settings_for(artifact.workflow_id)
    try:
        with MonnifySandboxClient(resolved) as client:
            tx = client.initialize_transaction(
                amount=money(artifact.config.price_ngn),
                customer_name="Studio Demo Customer",
                customer_email="customer@example.com",
                reference=reference,
                description=f"{artifact.config.product_name} ({artifact.config.business_name})",
            )
    except MonnifyError as exc:
        raise HTTPException(status_code=502, detail=f"Monnify sandbox error: {exc}") from None
    orders_service.create(
        reference=reference,
        artifact_id=artifact_id,
        product=artifact.config.product_name,
        amount=money(artifact.config.price_ngn),
        payment_reference=tx["payment_reference"],
        transaction_reference=tx["transaction_reference"],
        workflow_id=artifact.workflow_id,
    )
    log.info("artifact.pay.initialized", artifact_id=artifact_id, order=reference)
    return {
        "order_reference": reference,
        "payment_reference": tx["payment_reference"],
        "checkout_url": tx["checkout_url"],
    }


@app.put("/workflows/{workflow_id}/credentials", response_model=CredentialStatus)
def set_credentials(workflow_id: str, creds: MonnifyCredentials) -> CredentialStatus:
    """Store a workflow's own Monnify sandbox keys (#68, D19). Write-only.

    Values are never returned; only `configured`. Base URL stays sandbox-pinned,
    so a user cannot point Studio at production."""
    if store.get(workflow_id) is None:
        raise HTTPException(status_code=404, detail=f"unknown workflow: {workflow_id}")
    credential_store.put(workflow_id, creds)
    return credential_store.status(workflow_id)


@app.get("/workflows/{workflow_id}/credentials", response_model=CredentialStatus)
def get_credentials_status(workflow_id: str) -> CredentialStatus:
    """Whether this workflow has usable credentials, and from where. No secrets."""
    if store.get(workflow_id) is None:
        raise HTTPException(status_code=404, detail=f"unknown workflow: {workflow_id}")
    return credential_store.status(workflow_id)


@app.delete("/workflows/{workflow_id}/credentials", response_model=CredentialStatus)
def delete_credentials(workflow_id: str) -> CredentialStatus:
    credential_store.delete(workflow_id)
    return credential_store.status(workflow_id)


class InvoiceCreate(BaseModel):
    customer: str
    description: str
    amount: Decimal = Field(ge=100)  # exact to the kobo, never a float (D21)


@app.post("/preview/{artifact_id}/invoices", response_model=Order)
def create_invoice(artifact_id: str, body: InvoiceCreate) -> Order:
    """Create an invoice the merchant can share as a link (#85)."""
    artifact = _artifact_or_404(artifact_id)
    reference = f"INV-{uuid4().hex[:6].upper()}"
    inv = orders_service.create(
        reference=reference,
        artifact_id=artifact_id,
        product=body.description,
        amount=body.amount,
        workflow_id=artifact.workflow_id,
        kind="invoice",
        customer=body.customer,
        description=body.description,
    )
    log.info("invoice.created", artifact_id=artifact_id, invoice=reference, amount=body.amount)
    return inv


@app.get("/preview/{artifact_id}/invoices", response_model=list[Order])
def list_invoices(artifact_id: str) -> list[Order]:
    _artifact_or_404(artifact_id)
    return orders_service.invoices_for(artifact_id)


@app.get("/preview/{artifact_id}/invoice/{reference}", response_class=HTMLResponse)
def invoice_page(artifact_id: str, reference: str) -> HTMLResponse:
    """The shareable, buyer-facing invoice page (#85)."""
    artifact = _artifact_or_404(artifact_id)
    inv = orders_service.get(reference)
    if inv is None or inv.artifact_id != artifact_id:
        raise HTTPException(status_code=404, detail=f"unknown invoice: {reference}")
    return HTMLResponse(render_invoice_page(artifact, inv))


# --- Self-serve shop link (#91): one link, buyers assemble their own invoice ---


@app.get("/preview/{artifact_id}/shop", response_class=HTMLResponse)
def storefront(artifact_id: str) -> HTMLResponse:
    """The seller's shareable shop: the link that goes in a WhatsApp bio or a
    printed QR. Buyers pick items here and we generate their invoice (#91)."""
    artifact = _artifact_or_404(artifact_id)
    return HTMLResponse(render_storefront(artifact))


@app.get("/preview/{artifact_id}/shop/qr.svg")
def shop_qr(artifact_id: str, request: Request) -> Response:
    """A real QR for the shop link, so a seller can print it on a flyer, a shop
    wall, a product tag, or a car windscreen (#91). Built from the host the
    dashboard was opened on, so it points wherever the app is actually served."""
    import io

    import segno

    _artifact_or_404(artifact_id)
    base = str(request.base_url).rstrip("/")
    url = f"{base}/preview/{artifact_id}/shop"
    buf = io.BytesIO()
    segno.make(url, error="m").save(
        buf, kind="svg", scale=5, border=2, dark="#0f6b57"
    )
    return Response(content=buf.getvalue(), media_type="image/svg+xml")


class CatalogItemInput(BaseModel):
    name: str
    price_ngn: Decimal = Field(ge=0)


class CatalogUpdate(BaseModel):
    items: list[CatalogItemInput] = Field(default_factory=list)


@app.get("/preview/{artifact_id}/catalog", response_model=list[CatalogItem])
def get_shop_catalog(artifact_id: str) -> list[CatalogItem]:
    """What the seller currently sells (their editable price list) (#91)."""
    artifact = _artifact_or_404(artifact_id)
    return artifact.config.shop_items()


@app.put("/preview/{artifact_id}/catalog", response_model=list[CatalogItem])
def set_shop_catalog(artifact_id: str, body: CatalogUpdate) -> list[CatalogItem]:
    """The seller edits their price list from the dashboard: a name and a price
    per row, no dev and no config file. The shop reflects it immediately (#91)."""
    artifact = _artifact_or_404(artifact_id)
    artifact.config.catalog = [
        CatalogItem(name=i.name.strip(), price_ngn=i.price_ngn)
        for i in body.items
        if i.name.strip()
    ]
    log.info("shop.catalog.updated", artifact_id=artifact_id, items=len(artifact.config.catalog))
    return artifact.config.catalog


class ShopSelection(BaseModel):
    id: str
    qty: int = Field(ge=1, le=999)


class ShopInvoiceRequest(BaseModel):
    customer: str = ""
    customer_whatsapp: str = ""  # optional: we message the buyer the invoice (#99)
    customer_email: str = ""  # optional: alternative/additional channel (#99)
    selections: list[ShopSelection] = Field(min_length=1)


@app.post("/preview/{artifact_id}/shop/invoice")
def shop_invoice(artifact_id: str, body: ShopInvoiceRequest, request: Request) -> dict:
    """Turn a buyer's selection into a real multi-line invoice and hand back its
    shareable link (#91). Prices come from the seller's catalog, never the
    client, so a buyer cannot invoice themselves a discount. If the buyer gave a
    WhatsApp number, we message them the invoice link (#99)."""
    artifact = _artifact_or_404(artifact_id)
    prices = {it.id: it for it in artifact.config.shop_items()}
    line_items: list[LineItem] = []
    for sel in body.selections:
        item = prices.get(sel.id)
        if item is None:
            raise HTTPException(status_code=400, detail=f"unknown item: {sel.id}")
        line_items.append(
            LineItem(name=item.name, qty=sel.qty, unit_amount=item.price_ngn)
        )
    reference = f"INV-{uuid4().hex[:6].upper()}"
    summary = ", ".join(f"{li.qty}x {li.name}" for li in line_items)
    inv = orders_service.create(
        reference=reference,
        artifact_id=artifact_id,
        product=summary,
        amount=Decimal(0),  # ignored; total is derived from the line items (#91)
        workflow_id=artifact.workflow_id,
        kind="invoice",
        customer=body.customer.strip() or "Customer",
        customer_whatsapp=body.customer_whatsapp.strip(),
        customer_email=body.customer_email.strip(),
        description=summary,
        line_items=line_items,
    )
    invoice_url = f"/preview/{artifact_id}/invoice/{reference}"
    if inv.customer_whatsapp or inv.customer_email:
        base = str(request.base_url).rstrip("/")
        full_url = f"{base}{invoice_url}"
        if inv.customer_whatsapp:
            whatsapp_notifier.invoice_ready(
                artifact_id=artifact_id,
                number=inv.customer_whatsapp,
                business=artifact.config.business_name,
                amount=inv.amount,
                url=full_url,
            )
        if inv.customer_email:
            email_notifier.invoice_ready(
                artifact_id=artifact_id,
                to=inv.customer_email,
                business=artifact.config.business_name,
                amount=inv.amount,
                url=full_url,
            )
    log.info(
        "shop.invoice.created",
        artifact_id=artifact_id,
        invoice=reference,
        items=len(line_items),
        amount=str(inv.amount),
    )
    return {"invoice_reference": reference, "invoice_url": invoice_url}


def _thank_you_on_verified(order: Order) -> None:
    """When Monnify confirms a payment, message the buyer a thank-you (#99)."""
    if not (order.customer_whatsapp or order.customer_email):
        return
    artifact = artifact_store.get(order.artifact_id)
    business = artifact.config.business_name if artifact else "the seller"
    if order.customer_whatsapp:
        whatsapp_notifier.payment_thank_you(
            artifact_id=order.artifact_id,
            number=order.customer_whatsapp,
            business=business,
            amount=order.amount,
        )
    if order.customer_email:
        email_notifier.payment_thank_you(
            artifact_id=order.artifact_id,
            to=order.customer_email,
            business=business,
            amount=order.amount,
        )


orders_service.on_verified = _thank_you_on_verified


@app.get("/preview/{artifact_id}/notifications", response_model=list[Notification])
def artifact_notifications(artifact_id: str) -> list[Notification]:
    """Messages the product has sent buyers, newest first (#99)."""
    _artifact_or_404(artifact_id)
    return notification_log.for_artifact(artifact_id)


@app.post("/preview/{artifact_id}/invoice/{reference}/pay")
def invoice_pay(artifact_id: str, reference: str) -> dict:
    """Buyer clicked Pay now on an invoice: open a REAL sandbox checkout for
    exactly the invoice amount, into the merchant's account (#85, #68)."""
    artifact = _artifact_or_404(artifact_id)
    inv = orders_service.get(reference)
    if inv is None or inv.artifact_id != artifact_id:
        raise HTTPException(status_code=404, detail=f"unknown invoice: {reference}")
    resolved = credential_store.settings_for(artifact.workflow_id)
    try:
        with MonnifySandboxClient(resolved) as client:
            tx = client.initialize_transaction(
                amount=inv.amount,
                customer_name=inv.customer or "Invoice Customer",
                customer_email="customer@example.com",
                reference=f"{reference}-{uuid4().hex[:4]}",
                description=f"{inv.description} ({artifact.config.business_name})",
            )
    except MonnifyError as exc:
        raise HTTPException(status_code=502, detail=f"Monnify sandbox error: {exc}") from None
    orders_service.attach_payment(
        reference,
        payment_reference=tx["payment_reference"],
        transaction_reference=tx["transaction_reference"],
    )
    log.info("invoice.pay.initialized", invoice=reference, artifact_id=artifact_id)
    return {"invoice_reference": reference, "checkout_url": tx["checkout_url"]}


@app.get("/preview/{artifact_id}/orders", response_model=list[Order])
def list_orders(artifact_id: str) -> list[Order]:
    """Orders for the seller dashboard (#53). Status is provider truth only."""
    _artifact_or_404(artifact_id)
    return orders_service.for_artifact(artifact_id)


class ActivityItem(BaseModel):
    ts: str
    kind: str  # "run" | "notification" | "ledger"
    text: str  # plain words, no node ids or internal refs (kid-lens, #78/#79)


_RUN_WORDS = {
    "completed": "Practice run finished: everything worked",
    "failed": "A run hit a problem",
    "running": "A run is in progress",
    "waiting": "Waiting for something to happen (like a payment)",
    "pending": "A run is queued",
}


@app.get("/preview/{artifact_id}/activity", response_model=list[ActivityItem])
def artifact_activity(artifact_id: str) -> list[ActivityItem]:
    """Life for the generated dashboard, in plain words (#78).

    Notifications and ledger entries are derived from real execution events of
    the underlying workflow; friendly v1 lives here until #79 moves it into the
    executor itself.
    """
    artifact = _artifact_or_404(artifact_id)
    items: list[ActivityItem] = []
    for run in execution_store.list_runs(artifact.workflow_id):
        status = run.status.value if hasattr(run.status, "value") else str(run.status)
        items.append(
            ActivityItem(
                ts=run.created_at.isoformat(),
                kind="run",
                text=_RUN_WORDS.get(status, f"Run {status}"),
            )
        )
        for ev in execution_store.list_events(run.id):
            if ev.type.value != "node.completed" or not ev.node_type:
                continue
            if ev.node_type == "app.notify":
                items.append(
                    ActivityItem(
                        ts=ev.ts.isoformat(),
                        kind="notification",
                        text=f"Notification sent: {ev.message}",
                    )
                )
            elif ev.node_type == "app.credit_ledger":
                items.append(
                    ActivityItem(
                        ts=ev.ts.isoformat(),
                        kind="ledger",
                        text=f"Money recorded: {ev.message}",
                    )
                )
    for note in notification_log.for_artifact(artifact_id):
        items.append(
            ActivityItem(ts=note.ts.isoformat(), kind="notification", text=note.text)
        )
    items.sort(key=lambda i: i.ts, reverse=True)
    return items[:50]


@app.post("/preview/{artifact_id}/orders/{reference}/verify", response_model=Order)
def verify_order(artifact_id: str, reference: str) -> Order:
    """The fake-credit-alert trust boundary (#53, D17).

    A customer claiming "I have sent the money" lands here; the only thing
    that can change the order's status is Monnify's own answer.
    """
    _artifact_or_404(artifact_id)
    if orders_service.get(reference) is None:
        raise HTTPException(status_code=404, detail=f"unknown order: {reference}")
    with correlation(request_id=new_id("verify")):
        try:
            return orders_service.verify(reference)
        except MonnifyError as exc:
            raise HTTPException(
                status_code=502, detail=f"Monnify sandbox error: {exc}"
            ) from None


@app.post("/executions", response_model=StartExecutionResponse)
def start_execution(body: StartExecutionRequest) -> StartExecutionResponse:
    """Start an IR run and buffer a redacted event trace (#8, D2).

    MockAdapter is the default so #28 can consume a complete stream without
    sandbox credentials (D11).
    """
    if not settings.allow_production_execution and body.adapter == "monnify":
        raise HTTPException(
            status_code=403,
            detail="production/sandbox adapter disabled (ALLOW_PRODUCTION_EXECUTION=false)",
        )
    if body.adapter != "mock":
        raise HTTPException(status_code=400, detail=f"unknown adapter: {body.adapter}")

    with correlation(request_id=new_id("exec")):
        run = run_workflow(body.workflow, adapter=MockAdapter())
        events = execution_store.list_events(run.id)
        log.info(
            "api.execution.started",
            run_id=run.id,
            status=run.status.value,
            events=len(events),
        )
        return StartExecutionResponse(run=run, event_count=len(events))


@app.get("/executions/{run_id}", response_model=ExecutionRun)
def get_execution(run_id: str) -> ExecutionRun:
    run = execution_store.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"unknown run: {run_id}")
    return run


@app.get("/executions/{run_id}/events", response_model=list[ExecutionEvent])
def list_execution_events(run_id: str) -> list[ExecutionEvent]:
    """Snapshot of the buffered trace (handy for tests and first paint)."""
    if execution_store.get(run_id) is None:
        raise HTTPException(status_code=404, detail=f"unknown run: {run_id}")
    return execution_store.list_events(run_id)


@app.get("/executions/{run_id}/events/stream")
async def stream_execution_events(run_id: str) -> StreamingResponse:
    """SSE stream of ExecutionEvents for the #28 viewer (#8).

    Replays buffered events first, then hearts until the run is terminal.
    MVP runs complete synchronously before the stream opens, so clients usually
    get the full trace on connect.
    """
    if execution_store.get(run_id) is None:
        raise HTTPException(status_code=404, detail=f"unknown run: {run_id}")

    async def event_generator():
        last_seq = -1
        terminal = {RunStatus.COMPLETED, RunStatus.FAILED}
        while True:
            run = execution_store.get(run_id)
            if run is None:
                break
            batch = execution_store.list_events(run_id, after_seq=last_seq)
            for event in batch:
                last_seq = event.seq
                payload = event.model_dump(mode="json")
                yield f"id: {event.seq}\nevent: {event.type.value}\ndata: {json.dumps(payload)}\n\n"
            if run.status in terminal:
                yield "event: done\ndata: {}\n\n"
                break
            await asyncio.sleep(0.25)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

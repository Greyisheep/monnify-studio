"""HTTP surface for the Studio canvas: IR load/edit, analyze, typed wiring, Apply-Fix.

Run from apps/api:
    .venv/bin/uvicorn monnify_studio.api.main:app --reload --port 8010 --host 127.0.0.1
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timedelta, timezone

from decimal import Decimal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from monnify_studio.ai import (
    ComposeError,
    ComposeRefused,
    ComposeUnavailable,
    Source,
    classify_intent,
    compose_flow,
    explain,
    refine_flow,
)
from monnify_studio.analysis import Report, analyze
from monnify_studio.artifacts import (
    ArtifactConfig,
    CatalogItem,
    artifact_store,
    flow_features,
    generate_artifact,
    render_contribute_page,
    render_invoice_page,
    render_storefront,
)
from monnify_studio.codegen import generate_python
from monnify_studio.credentials import (
    CredentialStatus,
    MonnifyCredentials,
    credential_store,
)
from monnify_studio.onboarding import (
    SESSION_COOKIE,
    StudioProfile,
    StudioProfileUpdate,
    profile_store,
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
    SandboxAdapter,
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
    # Next often hops 3000→3001 when a port is busy; keep local origins wide.
    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001,"
        "http://localhost:3002,http://127.0.0.1:3002"
    )


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


def _cors_allow_origins() -> list[str]:
    configured = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    if settings.studio_env != "development":
        return configured
    # Local Next hops ports; never 400 a browser preflight during the demo.
    extras = [
        f"http://{host}:{port}"
        for host in ("localhost", "127.0.0.1")
        for port in range(3000, 3011)
    ]
    return list(dict.fromkeys([*configured, *extras]))


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
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


def _session_id(request: Request, response: Response) -> str:
    existing = request.cookies.get(SESSION_COOKIE)
    if existing:
        return existing
    sid = new_id("sess")
    # Production genuinely is cross-origin: web and api are separate Cloud Run
    # services (different hostnames). A SameSite=Lax cookie is never attached
    # to a cross-site fetch/XHR, so onboarding lost its session on every call
    # past the first, silently resetting path/goal/step (#135 follow-up). Local
    # dev goes through the same-origin /studio-backend proxy, so Lax + non-
    # secure (works over http) is correct there; production needs None+Secure.
    cross_origin = settings.studio_env != "development"
    response.set_cookie(
        key=SESSION_COOKIE,
        value=sid,
        httponly=True,
        samesite="none" if cross_origin else "lax",
        secure=cross_origin,
        max_age=60 * 60 * 24 * 30,
    )
    return sid


@app.get("/studio/profile", response_model=StudioProfile)
def get_studio_profile(request: Request, response: Response) -> StudioProfile:
    """Who this browser is (business/developer) and onboarding progress (#103)."""
    sid = _session_id(request, response)
    return profile_store.get_or_create(sid)


@app.put("/studio/profile", response_model=StudioProfile)
def put_studio_profile(
    body: StudioProfileUpdate,
    request: Request,
    response: Response,
) -> StudioProfile:
    """Persist path, products, and step. Backend is the source of truth."""
    sid = _session_id(request, response)
    return profile_store.update(sid, body)


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
            # No provider, or an upstream outage: not the user's fault, not a 422.
            raise HTTPException(status_code=503, detail=str(exc)) from None
        except ComposeRefused as exc:
            # Honest decline: the request is not a Monnify money flow (#106).
            raise HTTPException(
                status_code=422, detail=f"Moni can't build that: {exc.reason}"
            ) from None
        except ComposeError as exc:
            # Tried, but could not make it verifiably safe within the round budget.
            raise HTTPException(
                status_code=422,
                detail="Moni could not produce a verifiably safe flow: "
                + "; ".join(exc.errors),
            ) from None
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001 - never leak a raw 500 (keeps CORS)
            log.error("assistant.compose.unexpected", error=type(exc).__name__)
            raise HTTPException(
                status_code=500, detail="Moni hit an unexpected error composing this flow."
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


class RefineRequest(BaseModel):
    workflow_id: str
    message: str  # plain-words instruction: "add a refund path", "fix this"
    provider: str | None = None


@app.post("/assistant/refine", response_model=ComposeResponse)
def assistant_refine(body: RefineRequest) -> ComposeResponse:
    """Moni corrects the flow on the whiteboard (#148, dev item 7).

    Same verify-refuse loop and same response shape as compose, so the canvas
    updates in place; the revised flow keeps its id. An unclean revision never
    ships; a non-payment ask gets an honest decline.
    """
    with correlation(request_id=new_id("moni")):
        current = store.get(body.workflow_id)
        if current is None:
            raise HTTPException(
                status_code=404, detail=f"unknown workflow: {body.workflow_id}"
            )
        try:
            outcome = refine_flow(current, body.message, provider=body.provider)
        except ComposeUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from None
        except ComposeRefused as exc:
            raise HTTPException(
                status_code=422, detail=f"Moni can't do that here: {exc.reason}"
            ) from None
        except ComposeError as exc:
            raise HTTPException(
                status_code=422,
                detail="Moni could not make that change verifiably safe: "
                + "; ".join(exc.errors),
            ) from None
        except Exception as exc:  # noqa: BLE001 - typed 500 keeps CORS (#106)
            log.info("assistant.refine.unexpected", error=type(exc).__name__)
            raise HTTPException(
                status_code=500, detail="Moni hit an unexpected error; try again."
            ) from None
        saved = store.save(outcome.workflow)
        payload = _enrich(saved)
        log.info(
            "assistant.refine",
            workflow=saved.id,
            provider=outcome.provider,
            caught=len(outcome.report_before.findings),
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


class ContributeRequest(BaseModel):
    member: str = Field(min_length=2, max_length=80)


@app.get("/preview/{artifact_id}/contribute", response_class=HTMLResponse)
def contribute_page(artifact_id: str) -> HTMLResponse:
    """Member-facing contribution page for ledger flows - ajo/esusu (#160).

    The shareable link for a savings group: the member types their name, sees
    the fixed contribution, pays; the pool only credits after Monnify confirms.
    """
    artifact = _artifact_or_404(artifact_id)
    return HTMLResponse(render_contribute_page(artifact))


@app.post("/preview/{artifact_id}/contribute")
def contribute(artifact_id: str, body: ContributeRequest) -> dict:
    """A member's contribution becomes a verifiable record (#160).

    Reuses the invoice/verify machinery (#85, #53): the record is only marked
    paid by provider truth, so the group ledger cannot be faked."""
    artifact = _artifact_or_404(artifact_id)
    reference = f"AJO-{uuid4().hex[:6].upper()}"
    member = body.member.strip()
    inv = orders_service.create(
        reference=reference,
        artifact_id=artifact_id,
        product=artifact.config.product_name,
        amount=Decimal(artifact.config.price_ngn),
        workflow_id=artifact.workflow_id,
        kind="invoice",
        customer=member,
        description=f"{artifact.config.product_name} - {member}",
    )
    log.info(
        "contribute.created",
        artifact_id=artifact_id,
        reference=reference,
        amount=str(inv.amount),
    )
    return {
        "contribution_reference": reference,
        "pay_url": f"/preview/{artifact_id}/invoice/{reference}",
    }


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


class DashboardTotals(BaseModel):
    period: str  # "today" | "week" | "month" | "all"
    money_in: Decimal  # verified only, exact to the kobo (D21)
    money_out: Decimal
    profit: Decimal
    orders_total: int
    verified: int
    needs_attention: int
    rejected: int


_PERIOD_DAYS = {"today": 1, "week": 7, "month": 30}


@app.get("/preview/{artifact_id}/totals", response_model=DashboardTotals)
def artifact_totals(artifact_id: str, period: str = "week") -> DashboardTotals:
    """The Dashboard money book: money in / out / profit for a period (#134, #135).

    Money in is the exact sum of orders Monnify verified, never a claim. `period`
    is today / week / month / all; anything else falls back to all-time.
    """
    _artifact_or_404(artifact_id)
    since: datetime | None = None
    days = _PERIOD_DAYS.get(period)
    if days is not None:
        since = datetime.now(timezone.utc) - timedelta(days=days)
    else:
        period = "all"
    totals = orders_service.totals_for(artifact_id, since=since)
    return DashboardTotals(period=period, **totals)


class DashboardData(BaseModel):
    """Everything the business Dashboard needs, keyed by workflow id so the UI
    never has to thread an artifact id through onboarding (#135)."""

    artifact_id: str | None = None
    shop_path: str | None = None  # kept for back-compat; == share_path for shops
    # Goal-aware share link (#160): a shop link for sellers, a contribution link
    # for ajo/ledger flows, nothing for flows with no customer-facing page.
    share_kind: str | None = None  # "shop" | "contribute"
    share_label: str = ""  # "Your shop link" | "Your contribution link"
    share_path: str | None = None
    business_name: str = ""
    totals: DashboardTotals | None = None
    invoices: list[Order] = Field(default_factory=list)
    activity: list[ActivityItem] = Field(default_factory=list)


def _share_surface(workflow_id: str, artifact_id: str) -> tuple[str | None, str, str | None]:
    """Which shareable link fits this flow (#160): a ledger flow (ajo/esusu)
    shares a contribution link; a collecting flow shares its shop; anything
    else (e.g. pure payroll) has no customer-facing page to share."""
    workflow = store.get(workflow_id)
    features = flow_features(workflow) if workflow is not None else None
    # A ledger flow (ajo/esusu credits a pool) shares a contribution link; a
    # collecting/invoicing flow shares its shop; a pure payout flow (payroll)
    # has no customer-facing page, so no share card at all (#160).
    if features and features.has_ledger:
        return "contribute", "Your contribution link", f"/preview/{artifact_id}/contribute"
    if features is None or features.collects or features.has_invoices:
        return "shop", "Your shop link", f"/preview/{artifact_id}/shop"
    return None, "", None


@app.get("/workflows/{workflow_id}/dashboard", response_model=DashboardData)
def workflow_dashboard(workflow_id: str, period: str = "all") -> DashboardData:
    """The business Dashboard's data for a workflow: money totals, invoices,
    activity, and the goal-aware share link (#135, #160). Empty (but 200) until
    a product exists."""
    artifact = artifact_store.latest_for_workflow(workflow_id)
    if artifact is None:
        return DashboardData()
    aid = artifact.artifact_id
    kind, label, path = _share_surface(workflow_id, aid)
    return DashboardData(
        artifact_id=aid,
        shop_path=path if kind == "shop" else None,
        share_kind=kind,
        share_label=label,
        share_path=path,
        business_name=artifact.config.business_name,
        totals=artifact_totals(aid, period),
        invoices=orders_service.for_artifact(aid),
        activity=artifact_activity(aid),
    )


class GeneratedCode(BaseModel):
    language: str
    filename: str
    code: str


@app.get("/workflows/{workflow_id}/code", response_model=GeneratedCode)
def workflow_code(workflow_id: str, lang: str = "python") -> GeneratedCode:
    """Copy REAL code for your flow (#146, dev item 6).

    Deterministic Jinja-free generation - no LLM in the codegen path (D3): the
    same flow always returns the same module. `lang` is python-only today; the
    parameter exists so more targets can land without an API break.
    """
    workflow = store.get(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail=f"unknown workflow: {workflow_id}")
    if lang != "python":
        raise HTTPException(status_code=400, detail="only lang=python is supported today")
    slug = re.sub(r"[^a-z0-9]+", "_", workflow.name.lower()).strip("_") or "flow"
    return GeneratedCode(
        language="python",
        filename=f"{slug}.py",
        code=generate_python(workflow),
    )


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


@app.post("/webhooks/monnify")
async def monnify_webhook(request: Request) -> dict:
    """Receive Monnify's transaction webhook the standard way (#178).

    The cheat sheet's #1 pro-tip: handle webhooks, don't poll. So we do - but
    we practice what our own analyzer preaches (MON: verify the signature, stay
    idempotent). Two guarantees hold here:

      1. Authenticity: the request is rejected unless `monnify-signature` matches
         an HMAC-SHA512 of the RAW body keyed by our secret. An unsigned or
         forged call gets 401 and never touches an order.
      2. The webhook nudges; it never asserts. Even a valid signature does not
         set an order paid - we re-derive from provider truth via the same
         verify() trust boundary as every other path (#53). A duplicate delivery
         is therefore harmless (verify() is terminal at VERIFIED).
    """
    raw = await request.body()
    # The dashboard webhook is signed with our platform secret (#178).
    secret = credential_store.settings_for(None).monnify_secret_key
    signature = request.headers.get("monnify-signature", "")
    computed = hmac.new(secret.encode(), raw, hashlib.sha512).hexdigest()
    if not secret or not hmac.compare_digest(signature, computed):
        raise HTTPException(status_code=401, detail="invalid webhook signature")

    try:
        payload = json.loads(raw or b"{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="webhook body is not JSON") from None
    event_data = payload.get("eventData", payload) or {}
    payment_reference = event_data.get("paymentReference", "")

    with correlation(request_id=new_id("webhook")):
        order = orders_service.by_payment_reference(payment_reference)
        if order is None:
            # Ack unknown references with 200 so Monnify does not retry forever.
            log.info("webhook.unmatched", payment_reference=payment_reference)
            return {"received": True, "matched": False}
        try:
            updated = orders_service.verify(order.reference)  # re-query, never trust the payload
        except MonnifyError as exc:
            raise HTTPException(status_code=502, detail=f"Monnify sandbox error: {exc}") from None
        log.info(
            "webhook.verified",
            reference=order.reference,
            payment_reference=payment_reference,
            status=updated.status.value,
        )
        return {"received": True, "reference": order.reference, "status": updated.status.value}


@app.post("/executions", response_model=StartExecutionResponse)
def start_execution(body: StartExecutionRequest) -> StartExecutionResponse:
    """Start an IR run and buffer a redacted event trace (#8, D2).

    MockAdapter is the default so #28 can consume a complete stream without
    sandbox credentials (D11).
    """
    if body.adapter not in ("mock", "monnify"):
        raise HTTPException(status_code=400, detail=f"unknown adapter: {body.adapter}")

    with correlation(request_id=new_id("exec")):
        if body.adapter == "monnify":
            # Run against the REAL sandbox (#9): a 200 is not correctness, so let
            # the canvas show provider truth. Credential-aware per workflow (D19).
            resolved = credential_store.settings_for(body.workflow.id)
            try:
                resolved.assert_sandbox()  # sandbox-pinned; never prod in the challenge
                resolved.assert_monnify_credentials()
            except RuntimeError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from None
            with SandboxAdapter(resolved) as adapter:
                run = run_workflow(body.workflow, adapter=adapter)
        else:
            run = run_workflow(body.workflow, adapter=MockAdapter())
        events = execution_store.list_events(run.id)
        log.info(
            "api.execution.started",
            run_id=run.id,
            adapter=body.adapter,
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


# Demo seed (#116): only when the deploy asks for it; tests/dev stay pristine.
if os.getenv("STUDIO_SEED_DEMO") == "1":  # pragma: no cover - deploy-time path
    from .seed import seed_demo

    seed_demo()

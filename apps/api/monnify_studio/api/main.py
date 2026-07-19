"""HTTP surface for the Studio canvas: IR load/edit, analyze, typed wiring, Apply-Fix.

Run from apps/api:
    .venv/bin/uvicorn monnify_studio.api.main:app --reload --port 8010 --host 127.0.0.1
"""

from __future__ import annotations

import asyncio
import json

from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from monnify_studio.analysis import Report, analyze
from monnify_studio.artifacts import (
    ArtifactConfig,
    artifact_store,
    generate_artifact,
)
from monnify_studio.config import Settings as StudioSettings
from monnify_studio.integrations.monnify import MonnifyError, MonnifySandboxClient
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
    try:
        with MonnifySandboxClient(StudioSettings()) as client:
            tx = client.initialize_transaction(
                amount=float(artifact.config.price_ngn),
                customer_name="Studio Demo Customer",
                customer_email="customer@example.com",
                reference=reference,
                description=f"{artifact.config.product_name} ({artifact.config.business_name})",
            )
    except MonnifyError as exc:
        raise HTTPException(status_code=502, detail=f"Monnify sandbox error: {exc}") from None
    log.info("artifact.pay.initialized", artifact_id=artifact_id, order=reference)
    return {
        "order_reference": reference,
        "payment_reference": tx["payment_reference"],
        "checkout_url": tx["checkout_url"],
    }


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

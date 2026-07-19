"""Minimal FastAPI skeleton so the canvas can load, edit, analyze, and remediate IR.

Run from apps/api:
    .venv/bin/uvicorn monnify_studio.api.main:app --reload --port 8010 --host 127.0.0.1
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from monnify_studio.analysis import Report, analyze
from monnify_studio.fixtures import safe_marketplace, unsafe_marketplace
from monnify_studio.ir.models import Workflow
from monnify_studio.ir.typing import control_edge_type_hint, validate_port_connection
from monnify_studio.providers import default_catalog
from monnify_studio.remediation import GraphDiff, apply_all_fixes, apply_fix, diff_workflows
from monnify_studio.store import store

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

app = FastAPI(
    title="Monnify Studio API",
    version="0.1.0",
    description="IR + architecture review + remediation surface for the Studio canvas.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    rule_id: str | None = None  # None / "ALL" → apply all
    finding_path: list[str] = Field(default_factory=list)


class RemediateResult(BaseModel):
    workflow: Workflow
    node_types: dict[str, NodeMeta]
    analysis: Report
    diff: GraphDiff


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
    # Still include unknowns so the canvas can render custom nodes.
    for node in workflow.nodes:
        if node.type not in metas:
            metas[node.type] = NodeMeta(
                type=node.type, category="application", title=node.type
            )
    return WorkflowPayload(workflow=workflow, node_types=metas)


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
    before = body.workflow
    try:
        if not body.rule_id or body.rule_id.upper() == "ALL":
            after = apply_all_fixes(before)
        else:
            after = apply_fix(before, body.rule_id.upper())
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    saved = store.save(after)
    payload = _enrich(saved)
    report = analyze(saved, catalog)
    return RemediateResult(
        workflow=payload.workflow,
        node_types=payload.node_types,
        analysis=report,
        diff=diff_workflows(before, saved),
    )

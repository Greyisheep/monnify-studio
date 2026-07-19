"""HTTP surface over the IR, analyzer, and remediation (#4 support, Phase 1.0).

Thin routing only: every route delegates to the same pure functions the tests
and demos use, so behaviour cannot drift between the CLI and the API.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..analysis import Report, analyze
from ..fixtures import safe_marketplace, unsafe_marketplace
from ..ir.models import Workflow
from ..observability import correlation, get_logger, new_id
from ..providers import default_catalog
from ..providers.base import NodeTypeDef
from ..remediation import RemediationResult, remediate_all

router = APIRouter()
log = get_logger("api")

_catalog = default_catalog()
_WORKFLOWS = {
    "marketplace-unsafe": unsafe_marketplace,
    "marketplace-safe": safe_marketplace,
}


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/catalog", response_model=list[NodeTypeDef])
def catalog() -> list[NodeTypeDef]:
    """Every node type the canvas can render or add."""
    return [_catalog.resolve(t) for t in _catalog.types()]


@router.get("/workflows")
def workflows() -> list[dict[str, str]]:
    return [{"id": key, "name": builder().name} for key, builder in _WORKFLOWS.items()]


def _load(workflow_id: str) -> Workflow:
    builder = _WORKFLOWS.get(workflow_id)
    if builder is None:
        raise HTTPException(status_code=404, detail=f"unknown workflow: {workflow_id}")
    return builder()


@router.get("/workflows/{workflow_id}", response_model=Workflow)
def get_workflow(workflow_id: str) -> Workflow:
    return _load(workflow_id)


@router.get("/workflows/{workflow_id}/analysis", response_model=Report)
def analyze_named(workflow_id: str) -> Report:
    with correlation(request_id=new_id("req")):
        report = analyze(_load(workflow_id), _catalog)
        log.info("api.analyze", workflow=workflow_id, findings=len(report.findings))
        return report


@router.post("/analyze", response_model=Report)
def analyze_workflow(workflow: Workflow) -> Report:
    with correlation(request_id=new_id("req")):
        return analyze(workflow, _catalog)


@router.post("/remediate", response_model=RemediationResult)
def remediate(workflow: Workflow) -> RemediationResult:
    with correlation(request_id=new_id("req")):
        result = remediate_all(workflow, _catalog)
        log.info("api.remediate", steps=len(result.steps), remaining=len(result.remaining))
        return result

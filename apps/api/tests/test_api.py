"""API contract: the canvas can fetch workflows, analysis, catalog, remediation (#4)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from monnify_studio.api import create_app

client = TestClient(create_app())


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_get_unsafe_workflow():
    body = client.get("/workflows/marketplace-unsafe").json()
    assert body["id"] == "marketplace-unsafe"
    assert len(body["nodes"]) > 0


def test_unknown_workflow_is_404():
    assert client.get("/workflows/nope").status_code == 404


def test_analysis_flags_criticals_on_unsafe():
    ids = {f["rule_id"] for f in client.get("/workflows/marketplace-unsafe/analysis").json()["findings"]}
    assert {"MON001", "MON002", "MON009"} <= ids


def test_safe_analysis_is_clean():
    assert client.get("/workflows/marketplace-safe/analysis").json()["findings"] == []


def test_catalog_lists_node_types():
    catalog = client.get("/catalog").json()
    assert len(catalog) > 5
    assert any(item["type"] == "monnify.verify_transaction" for item in catalog)


def test_remediate_clears_the_unsafe_hero():
    workflow = client.get("/workflows/marketplace-unsafe").json()
    result = client.post("/remediate", json=workflow).json()
    assert result["remaining"] == []
    assert len(result["steps"]) >= 4

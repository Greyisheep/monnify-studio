"""API contract for the Studio canvas surface (#39, covering PR #35's endpoints)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from monnify_studio.api.main import app

client = TestClient(app)


def test_health():
    body = client.get("/health").json()
    assert body["status"] == "ok"


def test_catalog_lists_node_types():
    catalog = client.get("/catalog").json()
    assert "monnify.verify_transaction" in catalog


def test_workflows_are_seeded():
    ids = {w["id"] for w in client.get("/workflows").json()}
    assert {"marketplace-unsafe", "marketplace-safe"} <= ids


def test_get_workflow_payload():
    body = client.get("/workflows/marketplace-unsafe").json()
    assert body["workflow"]["id"] == "marketplace-unsafe"
    assert body["node_types"]  # enriched with catalog metadata


def test_unknown_workflow_is_404():
    assert client.get("/workflows/nope").status_code == 404


def test_analysis_flags_unsafe():
    ids = {f["rule_id"] for f in client.get("/workflows/marketplace-unsafe/analysis").json()["findings"]}
    assert {"MON001", "MON002", "MON009"} <= ids


def test_safe_analysis_is_clean():
    assert client.get("/workflows/marketplace-safe/analysis").json()["findings"] == []


def test_validate_connection_accepts_matching_ports():
    r = client.post(
        "/validate-connection",
        json={
            "source_type": "monnify.initialize_transaction",
            "source_port": "payment_reference",
            "target_type": "monnify.verify_transaction",
            "target_port": "payment_reference",
        },
    ).json()
    assert r["ok"] is True


def test_validate_connection_rejects_type_mismatch():
    r = client.post(
        "/validate-connection",
        json={
            "source_type": "monnify.initialize_transaction",
            "source_port": "checkout_url",
            "target_type": "monnify.verify_transaction",
            "target_port": "payment_reference",
        },
    ).json()
    assert r["ok"] is False


def test_remediate_all_clears_findings():
    workflow = client.get("/workflows/marketplace-unsafe").json()["workflow"]
    result = client.post("/remediate", json={"workflow": workflow, "rule_id": "ALL"}).json()
    assert result["analysis"]["findings"] == []
    assert result["diff"]["added_nodes"] or result["diff"]["removed_nodes"]

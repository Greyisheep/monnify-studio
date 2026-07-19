"""Artifact generation: the seller's product from the IR (#52, D17)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from monnify_studio.api.main import app
from monnify_studio.artifacts import ArtifactConfig, generate_artifact
from monnify_studio.fixtures import unsafe_marketplace
from monnify_studio.templates import build_template

client = TestClient(app)


def _generate_via_api(config: dict | None = None) -> dict:
    wf_id = client.post("/workflows/from-template/sell-online").json()["workflow"]["id"]
    res = client.post(f"/workflows/{wf_id}/generate", json={"config": config or {}})
    assert res.status_code == 200, res.text
    return res.json()


def test_generate_returns_contract_shape():
    data = _generate_via_api()
    assert data["artifact_id"].startswith("art_")
    assert data["preview_url"] == f"/preview/{data['artifact_id']}"
    assert data["dashboard_url"].endswith("/dashboard")


def test_generated_pages_serve_and_carry_config():
    data = _generate_via_api(
        {"business_name": "Ada Thrift", "product_name": "Vintage denim", "price_ngn": 15500}
    )
    page = client.get(data["preview_url"])
    assert page.status_code == 200
    assert "Ada Thrift" in page.text
    assert "Vintage denim" in page.text
    assert "15,500" in page.text

    dash = client.get(data["dashboard_url"])
    assert dash.status_code == 200
    assert "No orders yet" in dash.text
    assert "No confirmed payment" in dash.text  # the rejected-state badge exists

    css = client.get(f"{data['preview_url']}/skin.css")
    assert css.status_code == 200
    assert css.headers["content-type"].startswith("text/css")


def test_generate_refuses_critical_workflows():
    # The D17 envelope: no artifact from a graph that cannot keep the
    # "paid means verified" promise.
    unsafe = unsafe_marketplace()
    try:
        generate_artifact(unsafe, ArtifactConfig())
        raise AssertionError("expected ValueError for critical findings")
    except ValueError as exc:
        assert "MON001" in str(exc)


def test_generate_refuses_criticals_via_api():
    # Load the unsafe hero into the store and try to generate from it.
    res = client.post("/workflows/marketplace-unsafe/reset")
    assert res.status_code == 200
    gen = client.post("/workflows/marketplace-unsafe/generate", json={})
    assert gen.status_code == 400
    assert "critical findings" in gen.json()["detail"]


def test_generate_unknown_workflow_404():
    assert client.post("/workflows/nope/generate", json={}).status_code == 404


def test_preview_unknown_artifact_404():
    assert client.get("/preview/art_nope").status_code == 404


def test_template_workflow_generates_clean():
    # Belt and braces: the flagship template itself always passes the envelope.
    generate_artifact(build_template("sell-online"), ArtifactConfig())


def test_logo_renders_when_provided():
    # Seller branding (#61): data URL from a client-side file upload.
    tiny_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="
    data = _generate_via_api({"business_name": "Ada Thrift", "logo_url": tiny_png})
    page = client.get(data["preview_url"]).text
    assert 'class="brand-logo"' in page
    assert "brand-mark" not in page  # letter mark replaced
    dash = client.get(data["dashboard_url"]).text
    assert 'class="brand-logo"' in dash


def test_logo_absent_falls_back_to_letter_mark():
    data = _generate_via_api({"business_name": "Ada Thrift"})
    page = client.get(data["preview_url"]).text
    assert "brand-mark" in page
    assert "brand-logo" not in page


def test_logo_unsafe_scheme_rejected():
    wf_id = client.post("/workflows/from-template/sell-online").json()["workflow"]["id"]
    res = client.post(
        f"/workflows/{wf_id}/generate",
        json={"config": {"logo_url": "javascript:alert(1)"}},
    )
    assert res.status_code == 422
    assert "https:// or data:image/" in res.text

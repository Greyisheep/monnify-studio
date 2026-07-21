"""Goal-aware share links: ajo shares a contribution link, not a shop (#160)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from monnify_studio.api.main import app

client = TestClient(app)


def _dashboard_for(template_id: str) -> dict:
    wf = client.post(f"/workflows/from-template/{template_id}").json()["workflow"]
    client.post(
        f"/workflows/{wf['id']}/generate",
        json={"config": {"business_name": "Umu Ada", "product_name": "Monthly Dues",
                         "price_ngn": 5000}},
    )
    return client.get(f"/workflows/{wf['id']}/dashboard").json()


def test_ajo_shares_a_contribution_link_not_a_shop():
    data = _dashboard_for("ajo")
    assert data["share_kind"] == "contribute"
    assert data["share_label"] == "Your contribution link"
    assert data["share_path"].endswith("/contribute")
    assert data["shop_path"] is None  # an ajo group has no shop


def test_selling_business_shares_a_shop_link():
    for template_id in ("sell-online", "invoice"):
        data = _dashboard_for(template_id)
        assert data["share_kind"] == "shop", template_id
        assert data["share_label"] == "Your shop link"
        assert data["share_path"].endswith("/shop")


def test_contribution_page_and_flow_are_verify_driven():
    wf = client.post("/workflows/from-template/ajo").json()["workflow"]
    aid = client.post(
        f"/workflows/{wf['id']}/generate",
        json={"config": {"business_name": "Umu Ada", "product_name": "Monthly Dues",
                         "price_ngn": 5000}},
    ).json()["artifact_id"]

    page = client.get(f"/preview/{aid}/contribute").text
    assert "Umu Ada" in page and "Monthly Dues" in page and "5,000.00" in page
    assert "verified with Monnify" in page

    res = client.post(f"/preview/{aid}/contribute", json={"member": "Ngozi"})
    assert res.status_code == 200
    body = res.json()
    assert body["contribution_reference"].startswith("AJO-")
    assert body["pay_url"].endswith(body["contribution_reference"])

    # It became a real, still-unpaid invoice record: pool credits only on verify.
    invoices = client.get(f"/preview/{aid}/invoices").json()
    rec = next(i for i in invoices if i["reference"] == body["contribution_reference"])
    assert rec["status"] == "pending" and rec["customer"] == "Ngozi"


def test_short_member_name_is_rejected():
    wf = client.post("/workflows/from-template/ajo").json()["workflow"]
    aid = client.post(
        f"/workflows/{wf['id']}/generate", json={"config": {"business_name": "X"}}
    ).json()["artifact_id"]
    assert client.post(f"/preview/{aid}/contribute", json={"member": "A"}).status_code == 422

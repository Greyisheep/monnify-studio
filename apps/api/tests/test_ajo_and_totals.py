"""Ajo template + Dashboard money totals (#134, #135)."""

from __future__ import annotations

from decimal import Decimal

from fastapi.testclient import TestClient

from monnify_studio.analysis import analyze
from monnify_studio.api.main import app
from monnify_studio.orders import OrderStatus, orders_service
from monnify_studio.providers import default_catalog
from monnify_studio.templates import build_template

client = TestClient(app)


def test_ajo_template_registered_and_ranked_before_payroll():
    ids = [t["id"] for t in client.get("/templates").json()]
    assert "ajo" in ids
    # Ranking decided on #134: sell, invoice, ajo, payroll.
    assert ids.index("ajo") < ids.index("payroll")
    assert ids.index("invoice") < ids.index("ajo")


def test_ajo_flow_is_analyzer_clean():
    report = analyze(build_template("ajo"), default_catalog())
    assert report.findings == [], [f.rule_id for f in report.findings]


def test_ajo_has_both_money_in_and_money_out_paths():
    wf = build_template("ajo")
    types = {n.type for n in wf.nodes}
    # Money in: authenticated contribution -> credit. Money out: guarded payout.
    assert "event.payment_webhook" in types and "app.credit_ledger" in types
    assert "safety.balance_guard" in types and "monnify.initiate_transfer" in types
    assert "monnify.validate_bank_account" in types  # MON011 receiver validation


def _shop_artifact() -> str:
    wf = client.post("/workflows/from-template/invoice").json()["workflow"]
    res = client.post(
        f"/workflows/{wf['id']}/generate", json={"config": {"business_name": "Mama Nkechi"}}
    )
    return res.json()["artifact_id"]


def test_totals_counts_only_verified_money_exactly():
    artifact_id = _shop_artifact()
    # Two invoices: one verified, one still pending.
    paid = orders_service.create(
        reference="T-PAID",
        artifact_id=artifact_id,
        product="Jollof",
        amount=Decimal("45000.50"),
        kind="invoice",
        customer="Adaeze",
    )
    orders_service.create(
        reference="T-PENDING",
        artifact_id=artifact_id,
        product="Small chops",
        amount=Decimal("12000"),
        kind="invoice",
        customer="Chidi",
    )
    paid.status = OrderStatus.VERIFIED

    body = client.get(f"/preview/{artifact_id}/totals?period=all").json()
    # Money in is exact and verified-only; pending is not counted as money in.
    assert body["money_in"] == "45000.50"
    assert body["money_out"] == "0.00"
    assert body["profit"] == "45000.50"
    assert body["verified"] == 1
    assert body["needs_attention"] == 1  # the pending one
    assert body["orders_total"] == 2


def test_totals_period_defaults_and_bad_period_falls_back_to_all():
    artifact_id = _shop_artifact()
    assert client.get(f"/preview/{artifact_id}/totals").json()["period"] == "week"
    assert client.get(f"/preview/{artifact_id}/totals?period=rubbish").json()["period"] == "all"


def test_totals_404_for_unknown_artifact():
    assert client.get("/preview/nope/totals").status_code == 404


def test_workflow_dashboard_bundles_shop_totals_and_invoices():
    """The Dashboard's data, keyed by workflow id, in one call (#135)."""
    wf = client.post("/workflows/from-template/invoice").json()["workflow"]
    gen = client.post(
        f"/workflows/{wf['id']}/generate", json={"config": {"business_name": "Mama Nkechi"}}
    ).json()
    artifact_id = gen["artifact_id"]
    paid = orders_service.create(
        reference="WD-PAID",
        artifact_id=artifact_id,
        product="Jollof",
        amount=Decimal("45000"),
        kind="invoice",
        customer="Adaeze",
    )
    paid.status = OrderStatus.VERIFIED

    data = client.get(f"/workflows/{wf['id']}/dashboard").json()
    assert data["artifact_id"] == artifact_id
    assert data["shop_path"] == f"/preview/{artifact_id}/shop"
    assert data["business_name"] == "Mama Nkechi"
    assert data["totals"]["money_in"] == "45000.00"
    assert any(i["reference"] == "WD-PAID" for i in data["invoices"])


def test_workflow_dashboard_empty_but_200_before_a_shop_exists():
    data = client.get("/workflows/no-such-workflow/dashboard")
    assert data.status_code == 200
    assert data.json()["artifact_id"] is None

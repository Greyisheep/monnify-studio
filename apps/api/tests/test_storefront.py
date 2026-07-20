"""Self-serve shop link: buyers pick items, an invoice is generated (#91)."""

from __future__ import annotations

from decimal import Decimal

from fastapi.testclient import TestClient

from monnify_studio.api.main import app
from monnify_studio.artifacts import ArtifactConfig, generate_artifact
from monnify_studio.orders import orders_service
from monnify_studio.templates import build_template

client = TestClient(app)


def _shop_artifact(catalog=None) -> str:
    wf = client.post("/workflows/from-template/invoice").json()["workflow"]
    config = {"business_name": "Kunle Designs"}
    if catalog is not None:
        config["catalog"] = catalog
    res = client.post(f"/workflows/{wf['id']}/generate", json={"config": config})
    return res.json()["artifact_id"]


CATALOG = [
    {"id": "logo", "name": "Logo design", "price_ngn": 25000},
    {"id": "brand", "name": "Full brand identity", "price_ngn": 120000},
    {"id": "card", "name": "Business card design", "price_ngn": 15000},
]


def test_bare_config_still_has_a_buyable_shop():
    # No catalog: the single product becomes a one-item shop, so every shop works.
    cfg = ArtifactConfig(business_name="Ada", product_name="Ankara dress", price_ngn=8000)
    items = cfg.shop_items()
    assert len(items) == 1 and items[0].name == "Ankara dress"
    assert items[0].price_ngn == Decimal("8000")


def test_storefront_page_lists_the_sellers_items():
    artifact_id = _shop_artifact(CATALOG)
    page = client.get(f"/preview/{artifact_id}/shop").text
    assert "Kunle Designs" in page
    for name in ("Logo design", "Full brand identity", "Business card design"):
        assert name in page
    assert "Get my invoice" in page


def test_buyer_selection_becomes_a_multi_line_invoice():
    artifact_id = _shop_artifact(CATALOG)
    res = client.post(
        f"/preview/{artifact_id}/shop/invoice",
        json={
            "customer": "Chidi Okafor",
            "selections": [{"id": "logo", "qty": 1}, {"id": "card", "qty": 2}],
        },
    )
    assert res.status_code == 200
    ref = res.json()["invoice_reference"]

    inv = orders_service.get(ref)
    assert [li.name for li in inv.line_items] == ["Logo design", "Business card design"]
    # Total is the exact sum of the lines: 25000 + 2*15000.
    assert inv.amount == Decimal("55000.00")
    assert inv.customer == "Chidi Okafor"

    page = client.get(res.json()["invoice_url"]).text
    assert "Logo design" in page and "Business card design" in page
    assert "55,000.00" in page


def test_price_comes_from_the_catalog_not_the_client():
    # A buyer cannot smuggle a cheaper price; only id + qty are honored.
    artifact_id = _shop_artifact(CATALOG)
    res = client.post(
        f"/preview/{artifact_id}/shop/invoice",
        json={"selections": [{"id": "brand", "qty": 1, "price_ngn": 1}]},
    )
    ref = res.json()["invoice_reference"]
    assert orders_service.get(ref).amount == Decimal("120000.00")


def test_unknown_item_is_rejected():
    artifact_id = _shop_artifact(CATALOG)
    res = client.post(
        f"/preview/{artifact_id}/shop/invoice",
        json={"selections": [{"id": "nope", "qty": 1}]},
    )
    assert res.status_code == 400


def test_empty_selection_is_rejected():
    artifact_id = _shop_artifact(CATALOG)
    res = client.post(
        f"/preview/{artifact_id}/shop/invoice", json={"selections": []}
    )
    assert res.status_code == 422


def test_single_line_invoice_still_renders_as_a_document():
    # The manual invoice path (no line items) keeps its one-row document.
    artifact = generate_artifact(
        build_template("invoice"), ArtifactConfig(business_name="Ada")
    )
    inv = orders_service.create(
        reference="INV-SOLO",
        artifact_id=artifact.artifact_id,
        product="Consulting",
        amount=Decimal("50000"),
        kind="invoice",
        customer="Bola",
        description="Consulting",
    )
    from monnify_studio.artifacts import render_invoice_page

    page = render_invoice_page(artifact, inv)
    assert "Consulting" in page and "50,000.00" in page


def test_shop_qr_is_a_real_svg():
    artifact_id = _shop_artifact(CATALOG)
    res = client.get(f"/preview/{artifact_id}/shop/qr.svg")
    assert res.status_code == 200
    assert "image/svg" in res.headers["content-type"]
    assert res.text.lstrip().startswith("<?xml") or "<svg" in res.text


def test_dashboard_shows_the_shop_link_and_qr():
    artifact_id = _shop_artifact(CATALOG)
    html = client.get(f"/preview/{artifact_id}/dashboard").text
    assert "Your shop link" in html and "Share on WhatsApp" in html
    assert "shop/qr.svg" in html


def test_seller_edits_catalog_from_dashboard():
    artifact_id = _shop_artifact(CATALOG)
    # Replace the price list with the seller's own two items.
    res = client.put(
        f"/preview/{artifact_id}/catalog",
        json={"items": [
            {"name": "Ankara gown", "price_ngn": 18000},
            {"name": "Head tie", "price_ngn": 3500},
            {"name": "  ", "price_ngn": 999},  # blank name dropped
        ]},
    )
    assert res.status_code == 200
    names = [i["name"] for i in res.json()]
    assert names == ["Ankara gown", "Head tie"]
    # The shop reflects it immediately.
    shop = client.get(f"/preview/{artifact_id}/shop").text
    assert "Ankara gown" in shop and "Head tie" in shop and "Logo design" not in shop


def test_dashboard_has_the_item_editor():
    artifact_id = _shop_artifact(CATALOG)
    html = client.get(f"/preview/{artifact_id}/dashboard").text
    assert "What you sell" in html and "Save my items" in html

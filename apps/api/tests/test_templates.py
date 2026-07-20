"""Templates: analyzer-clean products + picker endpoints (#51, D17)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from monnify_studio.analysis import analyze
from monnify_studio.api.main import app
from monnify_studio.providers import default_catalog
from monnify_studio.templates import build_template, list_templates

client = TestClient(app)


def test_sell_online_analyzes_clean():
    # The whole D17 promise: the seller's flow ships with zero findings.
    report = analyze(build_template("sell-online"), default_catalog())
    assert report.findings == [], [f.rule_id for f in report.findings]


def test_catalog_covers_every_template_node_type():
    catalog = default_catalog()
    for info in list_templates():
        wf = build_template(info.id)
        for node in wf.nodes:
            assert catalog.get(node.type) is not None, f"missing def: {node.type}"


def test_templates_endpoint_lists_sell_online():
    res = client.get("/templates")
    assert res.status_code == 200
    ids = [t["id"] for t in res.json()]
    assert "sell-online" in ids
    entry = next(t for t in res.json() if t["id"] == "sell-online")
    assert entry["title"] and entry["persona"] and entry["description"]


def test_from_template_roundtrip():
    res = client.post("/workflows/from-template/sell-online")
    assert res.status_code == 200
    payload = res.json()
    wf = payload["workflow"]
    assert wf["id"].startswith("sell-online-")
    assert len(wf["nodes"]) == 9
    # node metadata attached for the canvas
    assert wf["nodes"][0]["type"] in payload["node_types"]

    # the instantiated workflow is loadable and analyzer-clean via the API
    loaded = client.get(f"/workflows/{wf['id']}")
    assert loaded.status_code == 200
    analysis = client.get(f"/workflows/{wf['id']}/analysis")
    assert analysis.status_code == 200
    assert analysis.json()["findings"] == []


def test_from_template_instances_are_isolated():
    a = client.post("/workflows/from-template/sell-online").json()["workflow"]["id"]
    b = client.post("/workflows/from-template/sell-online").json()["workflow"]["id"]
    assert a != b


def test_from_template_unknown_404():
    res = client.post("/workflows/from-template/nope")
    assert res.status_code == 404

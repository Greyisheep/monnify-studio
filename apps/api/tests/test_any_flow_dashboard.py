"""Any flow ends in a product: generic dashboard + activity feed (#78, D17)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from monnify_studio.api.main import app
from monnify_studio.artifacts import ArtifactConfig, flow_features, generate_artifact
from monnify_studio.executor import MockAdapter, run_workflow
from monnify_studio.ir.models import Edge, Node, Workflow

client = TestClient(app)


def _ajo_flow() -> Workflow:
    """A composed-style flow that collects nothing: schedule -> credit -> notify."""
    return Workflow(
        id="ajo-test",
        name="Ajo Contributions",
        nodes=[
            Node(id="sched", type="event.scheduled", label="Contribution Day"),
            Node(id="credit", type="app.credit_ledger", label="Credit Member Ledger"),
            Node(id="notify", type="app.notify", label="Tell the Member"),
        ],
        edges=[
            Edge(source="sched", target="credit", kind="event"),
            Edge(source="credit", target="notify"),
        ],
        entrypoint="sched",
    )


def test_feature_detection():
    f = flow_features(_ajo_flow())
    assert f.has_ledger and f.has_notify
    assert not f.collects and not f.has_payout


def test_non_collecting_flow_gets_a_dashboard_without_orders():
    artifact = generate_artifact(_ajo_flow(), ArtifactConfig(business_name="Umu Ada Ajo"))
    html = artifact.dashboard_html
    assert "Umu Ada Ajo" in html
    assert "Contributions ledger" in html and "Notifications" in html and "Activity" in html
    assert "Orders" not in html  # no collection in this flow
    assert "Payment page" not in html


def test_sell_online_dashboard_keeps_orders():
    wf = client.post("/workflows/from-template/sell-online").json()["workflow"]
    res = client.post(
        f"/workflows/{wf['id']}/generate", json={"config": {"business_name": "Ada"}}
    )
    assert res.status_code == 200
    dash = client.get(res.json()["dashboard_url"]).text
    assert "Orders" in dash and "Payment page" in dash and "Activity" in dash


def test_activity_feed_speaks_plain_words_from_real_runs():
    wf = _ajo_flow()
    artifact = generate_artifact(wf, ArtifactConfig(business_name="Umu Ada Ajo"))
    run_workflow(wf, adapter=MockAdapter())  # a real (mock) execution

    res = client.get(f"/preview/{artifact.artifact_id}/activity")
    assert res.status_code == 200
    items = res.json()
    kinds = {i["kind"] for i in items}
    assert {"run", "notification", "ledger"} <= kinds
    notif = next(i for i in items if i["kind"] == "notification")
    assert "Tell the Member" in notif["text"]
    joined = " ".join(i["text"] for i in items)
    # Kid-lens: no internal refs or node ids in user copy (#79 direction).
    for leak in ("D1", "node.", "app.notify", "wait/event"):
        assert leak not in joined

"""Executor MVP: mock IR walk + redacted execution trace (#8, D1, D2, D11).

Behaviour contracts (ENGINEERING_STANDARDS §7): assert the stream shape and
redaction guarantees the #28 viewer will consume, not private call order.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from monnify_studio.api.main import app
from monnify_studio.executor import (
    ExecutionEventType,
    MockAdapter,
    execution_store,
    run_workflow,
)
from monnify_studio.fixtures import safe_marketplace, unsafe_marketplace
from monnify_studio.observability.redaction import REDACTED

client = TestClient(app)


def test_mock_run_emits_started_and_completed():
    run = run_workflow(unsafe_marketplace(), adapter=MockAdapter())
    events = execution_store.list_events(run.id)
    types = [event.type for event in events]
    assert ExecutionEventType.RUN_STARTED in types
    assert ExecutionEventType.RUN_COMPLETED in types
    assert run.status.value == "completed"
    assert any(event.type == ExecutionEventType.NODE_WAITING for event in events)


def test_event_seq_is_contiguous():
    run = run_workflow(unsafe_marketplace(), adapter=MockAdapter())
    events = execution_store.list_events(run.id)
    assert [event.seq for event in events] == list(range(len(events)))


def test_mock_walk_covers_parallel_roots():
    """Unsafe hero has webhook + confirm islands; both must appear in the trace."""
    run = run_workflow(unsafe_marketplace(), adapter=MockAdapter())
    node_ids = {
        event.node_id
        for event in execution_store.list_events(run.id)
        if event.node_id
    }
    assert {"init", "webhook", "confirm", "fulfil", "payout"} <= node_ids


def test_safe_marketplace_completes_cleanly():
    run = run_workflow(safe_marketplace(), adapter=MockAdapter())
    assert run.status.value == "completed"
    types = {event.type for event in execution_store.list_events(run.id)}
    assert ExecutionEventType.RUN_FAILED not in types


def test_mock_adapter_redacts_sensitive_keys():
    run = run_workflow(unsafe_marketplace(), adapter=MockAdapter())
    events = execution_store.list_events(run.id)
    completed = [
        event for event in events if event.type == ExecutionEventType.NODE_COMPLETED
    ]
    assert completed
    for event in completed:
        if event.response and isinstance(event.response.get("body"), dict):
            assert event.response["body"].get("api_key") == REDACTED


def test_api_start_execution_and_fetch_events():
    workflow = client.get("/workflows/marketplace-unsafe").json()["workflow"]
    started = client.post(
        "/executions", json={"workflow": workflow, "adapter": "mock"}
    ).json()
    run_id = started["run"]["id"]
    assert started["event_count"] > 0
    assert started["run"]["status"] == "completed"

    snap = client.get(f"/executions/{run_id}").json()
    assert snap["id"] == run_id

    events = client.get(f"/executions/{run_id}/events").json()
    assert events[0]["type"] == "run.started"
    assert events[-1]["type"] == "run.completed"
    assert any(event["type"] == "node.completed" for event in events)


def test_unknown_run_is_404():
    assert client.get("/executions/does-not-exist").status_code == 404
    assert client.get("/executions/does-not-exist/events").status_code == 404
    assert client.get("/executions/does-not-exist/events/stream").status_code == 404


def test_sse_stream_replays_trace():
    workflow = client.get("/workflows/marketplace-unsafe").json()["workflow"]
    run_id = client.post("/executions", json={"workflow": workflow}).json()["run"]["id"]
    with client.stream("GET", f"/executions/{run_id}/events/stream") as response:
        assert response.status_code == 200
        body = "".join(response.iter_text())
    assert "event: run.started" in body
    assert "event: run.completed" in body
    assert "event: done" in body


def test_monnify_adapter_blocked_without_flag():
    workflow = client.get("/workflows/marketplace-unsafe").json()["workflow"]
    res = client.post("/executions", json={"workflow": workflow, "adapter": "monnify"})
    assert res.status_code == 403


def test_unknown_adapter_is_400():
    workflow = client.get("/workflows/marketplace-unsafe").json()["workflow"]
    res = client.post("/executions", json={"workflow": workflow, "adapter": "paystack"})
    assert res.status_code == 400

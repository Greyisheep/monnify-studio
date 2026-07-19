"""Executor MVP: mock IR walk + redacted execution trace (#8, D1, D2, D11)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from monnify_studio.api.main import app
from monnify_studio.executor import (
    ExecutionEventType,
    MockAdapter,
    execution_store,
    run_workflow,
)
from monnify_studio.fixtures import unsafe_marketplace
from monnify_studio.observability.redaction import REDACTED

client = TestClient(app)


def test_mock_run_emits_started_and_completed():
    run = run_workflow(unsafe_marketplace(), adapter=MockAdapter())
    events = execution_store.list_events(run.id)
    types = [e.type for e in events]
    assert ExecutionEventType.RUN_STARTED in types
    assert ExecutionEventType.RUN_COMPLETED in types
    assert run.status.value == "completed"
    assert any(e.type == ExecutionEventType.NODE_WAITING for e in events)


def test_mock_adapter_redacts_sensitive_keys():
    run = run_workflow(unsafe_marketplace(), adapter=MockAdapter())
    events = execution_store.list_events(run.id)
    completed = [e for e in events if e.type == ExecutionEventType.NODE_COMPLETED]
    assert completed
    for event in completed:
        if event.response and isinstance(event.response.get("body"), dict):
            assert event.response["body"].get("api_key") == REDACTED


def test_api_start_execution_and_fetch_events():
    workflow = client.get("/workflows/marketplace-unsafe").json()["workflow"]
    started = client.post("/executions", json={"workflow": workflow, "adapter": "mock"}).json()
    run_id = started["run"]["id"]
    assert started["event_count"] > 0
    assert started["run"]["status"] == "completed"

    snap = client.get(f"/executions/{run_id}").json()
    assert snap["id"] == run_id

    events = client.get(f"/executions/{run_id}/events").json()
    assert events[0]["type"] == "run.started"
    assert events[-1]["type"] == "run.completed"
    assert any(e["type"] == "node.completed" for e in events)


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

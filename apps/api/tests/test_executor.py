"""Executor MVP: mock IR walk + redacted execution trace (#8, D1, D2, D11).

Behaviour contracts (ENGINEERING_STANDARDS §7): assert the stream shape and
redaction guarantees the #28 viewer will consume, not private call order.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

import monnify_studio.api.main as api_main
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


def test_wait_without_auto_resume_suspends_run():
    """D1: wait nodes are suspension points when auto-resume is off."""
    run = run_workflow(
        unsafe_marketplace(),
        adapter=MockAdapter(),
        auto_resume_waits=False,
    )
    assert run.status.value == "waiting"
    events = execution_store.list_events(run.id)
    types = [event.type for event in events]
    assert ExecutionEventType.NODE_WAITING in types
    assert ExecutionEventType.RUN_COMPLETED not in types


def test_event_seq_is_contiguous():
    run = run_workflow(unsafe_marketplace(), adapter=MockAdapter())
    events = execution_store.list_events(run.id)
    assert [event.seq for event in events] == list(range(len(events)))


def test_mock_walk_covers_parallel_roots():
    """Unsafe hero has webhook + confirm islands; both must appear in the trace."""
    run = run_workflow(unsafe_marketplace(), adapter=MockAdapter())
    node_ids = {event.node_id for event in execution_store.list_events(run.id) if event.node_id}
    assert {"init", "webhook", "confirm", "fulfil", "payout"} <= node_ids


def test_safe_marketplace_completes_cleanly():
    run = run_workflow(safe_marketplace(), adapter=MockAdapter())
    assert run.status.value == "completed"
    types = {event.type for event in execution_store.list_events(run.id)}
    assert ExecutionEventType.RUN_FAILED not in types


def test_mock_adapter_redacts_sensitive_keys():
    run = run_workflow(unsafe_marketplace(), adapter=MockAdapter())
    events = execution_store.list_events(run.id)
    completed = [event for event in events if event.type == ExecutionEventType.NODE_COMPLETED]
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


def test_monnify_adapter_requires_credentials(monkeypatch):
    """The sandbox-run adapter is available (sandbox-pinned) but refuses to run
    without Monnify credentials, with a clear 422 rather than a fake trace (#9)."""
    from monnify_studio.config import Settings

    empty = Settings(monnify_api_key="", monnify_secret_key="", monnify_contract_code="")
    monkeypatch.setattr(api_main.credential_store, "settings_for", lambda _wid: empty)
    workflow = client.get("/workflows/marketplace-unsafe").json()["workflow"]
    res = client.post("/executions", json={"workflow": workflow, "adapter": "monnify"})
    assert res.status_code == 422
    assert "credential" in res.json()["detail"].lower()


def test_unknown_adapter_is_400():
    workflow = client.get("/workflows/marketplace-unsafe").json()["workflow"]
    res = client.post("/executions", json={"workflow": workflow, "adapter": "paystack"})
    assert res.status_code == 400


def test_cfg_prefers_edited_camelcase_and_skips_placeholders():
    """Request-body edits (camelCase) drive the real call; unedited template
    placeholders (<...>) fall back to the default, not a literal string (#Flow C)."""
    from monnify_studio.executor.adapter import _cfg

    # A dev edited customerName -> that value wins over the snake_case fallback.
    assert _cfg({"customerName": "Ada"}, "customerName", "customer_name", default="X") == "Ada"
    # Snake_case still works when that is what is present.
    assert _cfg({"customer_name": "Bola"}, "customerName", "customer_name", default="X") == "Bola"
    # An untouched template placeholder is treated as unset -> default.
    assert (
        _cfg({"paymentReference": "<unique-reference>"}, "paymentReference", default="gen") == "gen"
    )
    # Nothing set -> default.
    assert _cfg({}, "narration", default="Payout") == "Payout"


def test_cfg_bool_handles_text_backed_request_fields():
    from monnify_studio.executor.adapter import _cfg_bool

    assert (
        _cfg_bool({"getAllAvailableBanks": "false"}, "getAllAvailableBanks", default=True) is False
    )
    assert (
        _cfg_bool({"getAllAvailableBanks": "true"}, "getAllAvailableBanks", default=False) is True
    )


def test_live_reserved_account_node_calls_client_and_surfaces_real_account(monkeypatch):
    from monnify_studio.config import Settings
    from monnify_studio.executor.adapter import SandboxAdapter
    from monnify_studio.ir.models import Node

    class FakeClient:
        def create_reserved_account(self, **kwargs):
            assert kwargs["account_reference"] == "ajo-ada-1"
            assert kwargs["bvn"] == "21212121212"
            assert kwargs["get_all_available_banks"] is False
            return {
                "account_reference": "ajo-ada-1",
                "reservation_reference": "RES-1",
                "account_number": "6254727989",
                "account_name": "Ada Ajo Account",
                "bank": "Moniepoint Microfinance Bank",
                "bank_code": "50515",
                "status": "ACTIVE",
            }

    adapter = SandboxAdapter(
        Settings(
            monnify_api_key="key",
            monnify_secret_key="secret",
            monnify_contract_code="contract",
        )
    )
    monkeypatch.setattr(adapter, "_c", lambda: FakeClient())
    result = adapter.invoke(
        Node(
            id="account",
            type="monnify.create_reserved_account",
            config={
                "accountReference": "ajo-ada-1",
                "accountName": "Ada Ajo Account",
                "customerName": "Ada",
                "customerEmail": "ada@example.com",
                "bvn": "21212121212",
                "getAllAvailableBanks": "false",
            },
        ),
        {"inputs": {}},
    )
    assert result.ok is True
    assert result.outputs["account_number"] == "6254727989"
    assert result.outputs["status"] == "ACTIVE"


def test_notify_node_simulated_in_practice_and_recorded_live():
    """A notify block is a no-op-with-signal in Practice, and a real send path in
    a live run - never faked (#231)."""
    from monnify_studio.executor.adapter import MockAdapter
    from monnify_studio.ir.models import Node
    from monnify_studio.notifications import notification_log, whatsapp_notifier

    res = MockAdapter().invoke(
        Node(id="n", type="app.notify_whatsapp", config={"message": "hi"}),
        {"inputs": {}},
    )
    assert res.outputs["notified"] == "simulated"

    before = len(notification_log.for_artifact("studio-run"))
    delivered = whatsapp_notifier.notify(number="08110774138", text="test")
    assert delivered is False  # no Evolution configured in the test env
    assert len(notification_log.for_artifact("studio-run")) == before + 1

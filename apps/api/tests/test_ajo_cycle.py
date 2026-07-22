"""Ajo rotating-pool cycle: members, verified pay-ins, nudges, payout (#173).

The offline ritual, tested end to end: everyone pays (verified money only),
one member takes the whole pot, the turn rotates, and whoever has not paid
hears about it.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from monnify_studio.ajo import ajo_store
from monnify_studio.api.main import app
from monnify_studio.notifications import notification_log
import monnify_studio.api.main as api_main
from monnify_studio.orders import orders_service

client = TestClient(app)


def _ajo_artifact() -> str:
    wf = client.post("/workflows/from-template/ajo").json()["workflow"]
    res = client.post(
        f"/workflows/{wf['id']}/generate",
        json={"config": {"business_name": "Umuada Circle", "price_ngn": "5000"}},
    )
    return res.json()["artifact_id"]


def _contribute_and_verify(artifact_id: str, member: str) -> dict:
    """A member contributes and Monnify confirms it (scripted verifier)."""
    ref = client.post(f"/preview/{artifact_id}/contribute", json={"member": member}).json()[
        "contribution_reference"
    ]
    orders_service.attach_payment(
        ref, payment_reference=f"PAY-{ref}", transaction_reference=f"TX-{ref}"
    )
    original = orders_service.verifier
    orders_service.verifier = lambda r: {"status": "PAID", "amount_paid": 5000.0}
    try:
        return client.post(f"/preview/{artifact_id}/orders/{ref}/verify").json()
    finally:
        orders_service.verifier = original


def test_full_round_pays_out_to_beneficiary_and_rotates():
    artifact_id = _ajo_artifact()
    client.put(
        f"/preview/{artifact_id}/ajo/members",
        json={"members": [{"name": "Ada"}, {"name": "Bola"}]},
    )

    # Ada pays: 1 of 2 in, Bola is nudged, no payout yet.
    assert _contribute_and_verify(artifact_id, "Ada")["status"] == "verified"
    state = client.get(f"/preview/{artifact_id}/ajo").json()
    assert state["round"] == 1
    assert {m["name"]: m["paid"] for m in state["members"]} == {
        "Ada": True,
        "Bola": False,
    }
    assert state["beneficiary"] == "Ada"
    nudges = [n for n in notification_log.for_artifact(artifact_id) if "nudge" in n.text.casefold()]
    assert any("Bola" in n.text for n in nudges)
    assert all(n.delivered is False for n in nudges)  # no Evolution config in this test

    # Bola pays: pot completes, Ada takes it, round 2 begins, turn rotates.
    assert _contribute_and_verify(artifact_id, "Bola")["status"] == "verified"
    state = client.get(f"/preview/{artifact_id}/ajo").json()
    assert state["round"] == 2
    assert state["beneficiary"] == "Bola"
    assert all(m["paid"] is False for m in state["members"])
    assert len(state["payouts"]) == 1
    payout = state["payouts"][0]
    assert payout["beneficiary"] == "Ada"
    assert payout["amount"] == "10000.00"
    assert payout["kind"] == "sandbox"


def test_payout_is_honest_money_out_in_totals():
    artifact_id = _ajo_artifact()
    client.put(
        f"/preview/{artifact_id}/ajo/members",
        json={"members": [{"name": "Ada"}, {"name": "Bola"}]},
    )
    _contribute_and_verify(artifact_id, "Ada")
    _contribute_and_verify(artifact_id, "Bola")
    totals = client.get(f"/preview/{artifact_id}/totals?period=all").json()
    assert totals["money_in"] == "10000.00"
    assert totals["money_out"] == "10000.00"  # the recorded pot payout
    assert totals["profit"] == "0.00"  # in - out: the pool empties, honestly


def test_unknown_contributor_joins_the_rotation():
    artifact_id = _ajo_artifact()
    client.put(f"/preview/{artifact_id}/ajo/members", json={"members": [{"name": "Ada"}]})
    _contribute_and_verify(artifact_id, "Chika")
    names = [m["name"] for m in client.get(f"/preview/{artifact_id}/ajo").json()["members"]]
    assert names == ["Ada", "Chika"]


def test_no_group_means_no_cycle_side_effects():
    """A seller flow (no ajo group) verifies exactly as before."""
    artifact_id = _ajo_artifact()  # artifact exists but NO members registered
    result = _contribute_and_verify(artifact_id, "Ada")
    assert result["status"] == "verified"
    assert ajo_store.group(artifact_id) is None
    assert client.get(f"/preview/{artifact_id}/ajo").json()["members"] == []


def test_simulate_advances_cycle_without_touching_money():
    """Demo simulation drives rotation + nudges but never affects money_in (#173)."""
    artifact_id = _ajo_artifact()
    client.put(
        f"/preview/{artifact_id}/ajo/members",
        json={"members": [{"name": "Ada"}, {"name": "Bola"}]},
    )
    # Simulate the next unpaid member twice: completes the pot, rotates.
    first = client.post(f"/preview/{artifact_id}/ajo/simulate-contribution", json={}).json()
    assert first["simulated"]["member"] == "Ada"
    assert first["round"] == 1
    second = client.post(f"/preview/{artifact_id}/ajo/simulate-contribution", json={}).json()
    assert second["round"] == 2  # rotated
    assert len(second["payouts"]) == 1
    # Money in stays zero: no Monnify order was ever verified by the simulation.
    totals = client.get(f"/preview/{artifact_id}/totals?period=all").json()
    assert totals["money_in"] == "0.00"
    # Simulated payout must NOT hit the money book either.
    assert totals["money_out"] == "0.00"


def test_simulate_requires_members():
    artifact_id = _ajo_artifact()
    res = client.post(f"/preview/{artifact_id}/ajo/simulate-contribution", json={})
    assert res.status_code == 400


def test_adding_member_preserves_hidden_existing_whatsapp():
    """The UI resubmits existing names without their server-only numbers (#193)."""
    artifact_id = _ajo_artifact()
    client.put(
        f"/preview/{artifact_id}/ajo/members",
        json={"members": [{"name": "Ada", "whatsapp": "08030000000"}]},
    )
    client.put(
        f"/preview/{artifact_id}/ajo/members",
        json={"members": [{"name": "Ada"}, {"name": "Bola", "whatsapp": "08031111111"}]},
    )
    group = ajo_store.group(artifact_id)
    assert group is not None
    assert {m.name: m.whatsapp for m in group.members} == {
        "Ada": "08030000000",
        "Bola": "08031111111",
    }


def test_nudge_status_reflects_delivery_result(monkeypatch):
    artifact_id = _ajo_artifact()
    client.put(
        f"/preview/{artifact_id}/ajo/members",
        json={
            "members": [
                {"name": "Ada", "whatsapp": "08030000000"},
                {"name": "Bola", "whatsapp": "08031111111"},
            ]
        },
    )
    monkeypatch.setattr(api_main.whatsapp_notifier, "ajo_nudge", lambda **_kwargs: False)
    client.post(f"/preview/{artifact_id}/ajo/simulate-contribution", json={"member": "Ada"})
    failed = client.get(f"/preview/{artifact_id}/ajo").json()
    bola = next(m for m in failed["members"] if m["name"] == "Bola")
    assert bola["nudge_status"] == "failed"

    monkeypatch.setattr(api_main.whatsapp_notifier, "ajo_nudge", lambda **_kwargs: True)
    client.post(f"/preview/{artifact_id}/ajo/simulate-contribution", json={"member": "Bola"})
    rotated = client.get(f"/preview/{artifact_id}/ajo").json()
    assert all(m["nudge_status"] == "not_sent" for m in rotated["members"])

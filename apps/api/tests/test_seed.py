"""Boot seed: the demo business is complete, alive, and idempotent (#116)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from monnify_studio.api.main import app
from monnify_studio.api.seed import WORKFLOW_ID, seed_demo
from monnify_studio.store import store

client = TestClient(app)


def test_seed_builds_a_complete_living_demo():
    artifact_id = seed_demo()
    assert artifact_id is not None
    assert store.get(WORKFLOW_ID) is not None

    # The dashboard renders with the seeded identity and catalog.
    dash = client.get(f"/preview/{artifact_id}/dashboard").text
    assert "Mama Nkechi Foods" in dash

    # Both invoice states a seller will meet: one unpaid, one settled.
    invoices = client.get(f"/preview/{artifact_id}/invoices").json()
    statuses = {i["reference"]: i["status"] for i in invoices}
    assert statuses["INV-DEMO-A"] == "pending"
    assert statuses["INV-DEMO-B"] == "verified"

    # The shop offers the seeded price list.
    shop = client.get(f"/preview/{artifact_id}/shop").text
    assert "Party jollof (per cooler)" in shop and "Small chops tray" in shop

    # The practice run left a living activity feed (plain words, #78/#79).
    activity = client.get(f"/preview/{artifact_id}/activity").json()
    assert activity, "activity feed must not be empty after the seeded run"

    # Buyer-facing invoice page renders for the unpaid one.
    page = client.get(f"/preview/{artifact_id}/invoice/INV-DEMO-A").text
    assert "Chidi" in page and "12,000" in page


def test_seed_is_idempotent():
    assert seed_demo() is None  # second boot: no duplicates, quiet no-op

"""Payroll disbursements show as outflow on the Dashboard (#outflow).

The owner clicks the Dashboard and sees money OUT, per employee, from the real
run - not a claim.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from monnify_studio.api.main import app

client = TestClient(app)

WF = {
    "id": "pr-out", "name": "Staff Payroll", "version": 1, "provider": "monnify",
    "description": "", "variables": {}, "entrypoint": "rows",
    "nodes": [
        {"id": "rows", "type": "app.data_rows", "label": "Employees", "config": {"rows": [
            {"name": "Ada Obi", "account_number": "0123456789", "bank_code": "058", "amount": "150000"},
            {"name": "Bola Ade", "account_number": "0123456790", "bank_code": "058", "amount": "90000"},
        ]}, "inputs": {}, "extra_tags": [], "position": {"x": 0, "y": 0}},
        {"id": "bulk", "type": "monnify.bulk_transfer", "label": "Bulk", "config": {},
         "inputs": {}, "extra_tags": [], "position": {"x": 1, "y": 0}},
    ],
    "edges": [{"source": "rows", "target": "bulk", "kind": "control"}],
}


def test_dashboard_shows_payroll_outflow_from_a_real_run():
    assert client.post("/executions", json={"workflow": WF, "adapter": "mock"}).status_code == 200
    d = client.get("/workflows/pr-out/dashboard").json()
    assert d["totals"]["money_out"] == "240000.00"
    names = [(p["name"], p["amount"]) for p in d["payouts"]]
    assert ("Ada Obi", "150000.00") in names
    assert ("Bola Ade", "90000.00") in names


def test_no_run_no_outflow_is_clean_empty():
    d = client.get("/workflows/never-ran/dashboard").json()
    assert d["payouts"] == []
    assert d["totals"] is None

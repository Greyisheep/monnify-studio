"""Payroll template: MON011 made visible, and Moni routes it (#54, D17)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from monnify_studio.ai.moni import classify_intent
from monnify_studio.analysis import analyze
from monnify_studio.api.main import app
from monnify_studio.providers import default_catalog
from monnify_studio.templates import build_template

client = TestClient(app)


def _no_keys(monkeypatch) -> None:
    for k in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "AI_PROVIDER"):
        monkeypatch.delenv(k, raising=False)


def test_payroll_analyzes_clean():
    report = analyze(build_template("payroll"), default_catalog())
    assert report.findings == [], [f.rule_id for f in report.findings]


def test_removing_validation_triggers_mon011():
    # The hood-open beat: delete Validate Each Account and the analyzer objects.
    wf = build_template("payroll")
    wf.nodes = [n for n in wf.nodes if n.id != "validate"]
    wf.edges = [e for e in wf.edges if e.source != "validate" and e.target != "validate"]
    wf.edges.append(type(wf.edges[0])(source="rows", target="bulk"))
    ids = {f.rule_id for f in analyze(wf, default_catalog()).findings}
    assert "MON011" in ids


def test_templates_endpoint_lists_payroll():
    res = client.get("/templates")
    assert res.status_code == 200
    assert "payroll" in [t["id"] for t in res.json()]


def test_from_template_payroll_roundtrip():
    res = client.post("/workflows/from-template/payroll")
    assert res.status_code == 200
    wf = res.json()["workflow"]
    assert wf["id"].startswith("payroll-")
    analysis = client.get(f"/workflows/{wf['id']}/analysis")
    assert analysis.json()["findings"] == []


def test_moni_now_routes_payroll(monkeypatch):
    # The gap this closes: before #54, "build me a payroll" clamped to unknown.
    _no_keys(monkeypatch)
    intent, provider = classify_intent("Build me a payroll for my staff salaries")
    assert provider == "keyword"
    assert intent.template_id == "payroll"

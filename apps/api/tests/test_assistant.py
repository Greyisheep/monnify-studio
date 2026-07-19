"""AI assistant: canned design matching + chat SSE (#15)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from monnify_studio.ai.design import design_from_intent, match_template
from monnify_studio.ai.guardrails import redact_mapping
from monnify_studio.api.main import app, settings
from monnify_studio.fixtures import unsafe_marketplace
from monnify_studio.providers import default_catalog


def test_match_template_marketplace_variants():
    assert match_template("marketplace with payout after fulfilment") == "marketplace-safe"
    assert match_template("unsafe marketplace split payments") == "marketplace-unsafe"
    assert match_template("hello world") is None


def test_design_from_intent_runs_analyzer():
    catalog = default_catalog()
    result = design_from_intent(
        "marketplace checkout with vendor payout",
        catalog,
    )
    assert result.workflow is not None
    assert result.analysis is not None
    assert result.template_id == "marketplace-unsafe"
    assert any(f.rule_id.startswith("MON") for f in result.analysis.findings)


def test_design_clarifications_when_vague():
    result = design_from_intent("make me rich", default_catalog())
    assert result.workflow is None
    assert result.clarifications


def test_redact_secrets_from_context():
    payload = {"api_key": "sk-live-secret", "ok": "visible", "nested": {"password": "x"}}
    cleaned = redact_mapping(payload)
    assert cleaned["api_key"] == "[REDACTED]"
    assert cleaned["ok"] == "visible"
    assert cleaned["nested"]["password"] == "[REDACTED]"


def test_assistant_design_endpoint():
    client = TestClient(app)
    response = client.post(
        "/assistant/design",
        json={"intent": "safe marketplace with payout after fulfilment", "apply_safe": True},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["template_id"] == "marketplace-safe"
    assert body["workflow"]["id"].startswith("ai-")
    assert body["analysis"]["findings"] == []


def test_assistant_chat_sse_canned(monkeypatch):
    monkeypatch.setattr(settings, "ai_provider", "canned")
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    client = TestClient(app)
    with client.stream(
        "POST",
        "/assistant/chat",
        json={
            "message": "Why are the critical findings?",
            "workflow": unsafe_marketplace().model_dump(mode="json"),
            "history": [],
        },
    ) as response:
        assert response.status_code == 200
        text = "".join(response.iter_text())
    assert "event: token" in text
    assert "event: message" in text
    assert "event: done" in text
    assert '"provider": "canned"' in text

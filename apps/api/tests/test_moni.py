"""Moni: intent to template, safe by construction (#15, D16, D18)."""

from __future__ import annotations

import monnify_studio.ai.moni as moni_mod
from fastapi.testclient import TestClient

from monnify_studio.ai import classify_intent
from monnify_studio.ai.providers import KeywordFallback
from monnify_studio.ai.schema import MoniIntent
from monnify_studio.api.main import app

client = TestClient(app)


class _FakeProvider:
    """A stand-in LLM: returns a scripted intent, no network."""

    name = "fake"

    def __init__(self, intent: MoniIntent) -> None:
        self._intent = intent

    def available(self) -> bool:
        return True

    def infer(self, *, system, user, message) -> MoniIntent:
        return self._intent


def test_keyword_fallback_routes_selling(monkeypatch):
    # No provider available -> keyword fallback carries it (D11).
    monkeypatch.setattr(moni_mod, "select_provider", lambda p=None: KeywordFallback())
    intent, provider = classify_intent("I sell thrift clothes on Instagram")
    assert intent.template_id == "sell-online"
    assert provider == "keyword"


def test_keyword_fallback_routes_payroll(monkeypatch):
    # Payroll intent is recognized, but the payroll template lands in #54; until
    # then the guardrail coerces it to unknown (a template it names must exist).
    monkeypatch.setattr(moni_mod, "select_provider", lambda p=None: KeywordFallback())
    intent, _ = classify_intent("I need to pay my staff salaries every month")
    assert intent.template_id in {"payroll", "unknown"}


def test_unknown_intent_asks_a_question(monkeypatch):
    monkeypatch.setattr(moni_mod, "select_provider", lambda p=None: KeywordFallback())
    intent, _ = classify_intent("what is the weather today")
    assert intent.template_id == "unknown"
    assert intent.clarifying_question


def test_model_cannot_invent_a_template(monkeypatch):
    # The guardrail: a provider returning a bogus template id is coerced to unknown.
    bogus = MoniIntent(template_id="steal-all-the-money", confidence=1.0)
    monkeypatch.setattr(moni_mod, "select_provider", lambda p=None: _FakeProvider(bogus))
    intent, _ = classify_intent("anything")
    assert intent.template_id == "unknown"


def test_provider_error_degrades_to_keyword(monkeypatch):
    class _Boom:
        name = "boom"

        def available(self):
            return True

        def infer(self, **_):
            raise RuntimeError("provider exploded")

    monkeypatch.setattr(moni_mod, "select_provider", lambda p=None: _Boom())
    intent, provider = classify_intent("I sell online")
    assert intent.template_id == "sell-online"  # keyword rescue
    assert "keyword" in provider


def test_extracted_config_flows_to_a_real_template(monkeypatch):
    # Moni extracts config; it must round-trip through the working from-template path.
    extracted = MoniIntent(
        template_id="sell-online", confidence=0.9, business_name="Ada Thrift",
        product_name="Denim", price_ngn=15500,
    )
    monkeypatch.setattr(moni_mod, "select_provider", lambda p=None: _FakeProvider(extracted))
    res = client.post("/assistant/intent", json={"message": "..."})
    assert res.status_code == 200
    data = res.json()
    assert data["template_id"] == "sell-online"
    assert data["config"]["business_name"] == "Ada Thrift"
    assert data["config"]["price_ngn"] == 15500

    # The template it named is real and instantiates cleanly (the safety gate).
    wf = client.post(f"/workflows/from-template/{data['template_id']}").json()["workflow"]
    analysis = client.get(f"/workflows/{wf['id']}/analysis").json()
    assert analysis["findings"] == []


def test_assistant_endpoint_smoke(monkeypatch):
    # Neutralize any real keys so this test never makes a network call.
    keys = (
        "ANTHROPIC_API_KEY", "CLAUDE_API_KEY", "OPENAI_API_KEY",
        "GOOGLE_API_KEY", "GEMINI_API_KEY", "AI_PROVIDER",
    )
    for k in keys:
        monkeypatch.delenv(k, raising=False)
    res = client.post("/assistant/intent", json={"message": "I run a small online shop"})
    assert res.status_code == 200
    assert "provider" in res.json()

"""Ask Moni "why": grounded answers with real doc references (#75, D20)."""

from __future__ import annotations

from fastapi.testclient import TestClient

import importlib

from monnify_studio.ai.schema import MoniAnswer
from monnify_studio.api.main import app

# The package exports the explain *function*, which shadows the submodule on
# `import ... as`; resolve the module explicitly for monkeypatching.
explain_mod = importlib.import_module("monnify_studio.ai.explain")
explain = explain_mod.explain

client = TestClient(app)


class _Answering:
    name = "fake"

    def available(self) -> bool:
        return True

    def structured(self, **_):
        return MoniAnswer(answer="Split settles instantly, so payout-after-work needs Transfer.")


class _Failing:
    name = "boom"

    def available(self) -> bool:
        return True

    def structured(self, **_):
        raise RuntimeError("provider down")


def _offline(monkeypatch, provider):
    monkeypatch.setattr(explain_mod, "select_provider", lambda p=None: provider)
    monkeypatch.setattr(explain_mod, "_fetch_doc", lambda url, limit=3500: "official excerpt text")


def test_sources_come_from_catalog_never_model(monkeypatch):
    _offline(monkeypatch, _Answering())
    result, provider = explain("why is split wrong here?", node_type="monnify.transaction_split")
    assert provider == "fake"
    assert result.sources and all(
        s.url.startswith("https://developers.monnify.com") for s in result.sources
    )
    assert "Transfer" in result.answer


def test_provider_failure_degrades_to_grounding(monkeypatch):
    _offline(monkeypatch, _Failing())
    result, provider = explain("why validate the account?", node_type="monnify.validate_bank_account")
    assert "grounding" in provider  # fell back, but still a real answer
    assert "Name Enquiry" in result.answer or "payout account" in result.answer
    assert result.sources[0].url.startswith("https://developers.monnify.com")


def test_endpoint_roundtrip_and_unknown_node(monkeypatch):
    _offline(monkeypatch, _Answering())
    res = client.post(
        "/assistant/explain",
        json={"question": "why?", "node_type": "monnify.verify_transaction"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["answer"] and body["sources"][0]["url"].startswith("https://developers.monnify.com")

    assert (
        client.post(
            "/assistant/explain", json={"question": "why?", "node_type": "not.a.node"}
        ).status_code
        == 404
    )


def test_doc_fetch_failure_is_not_fatal(monkeypatch):
    monkeypatch.setattr(explain_mod, "select_provider", lambda p=None: _Answering())
    monkeypatch.setattr(explain_mod.httpx, "get", lambda *a, **k: (_ for _ in ()).throw(OSError()))
    explain_mod._DOC_CACHE.clear()
    result, _ = explain("why verify?", node_type="monnify.verify_transaction")
    assert result.answer  # catalog grounding carried it

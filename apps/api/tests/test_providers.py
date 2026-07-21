"""Provider selection + fallback reliability (#106): no coverage existed."""

from __future__ import annotations

import pytest

from monnify_studio.ai.providers import (
    FailoverProvider,
    KeywordFallback,
    _REGISTRY,
    select_provider,
)
from monnify_studio.ai.schema import MoniFlow, MoniIntent


def _no_providers_available(monkeypatch):
    """Make every real provider report unavailable, leaving only the fallback."""
    for cls in _REGISTRY.values():
        monkeypatch.setattr(cls, "available", lambda self: False)


def test_falls_back_to_keyword_when_nothing_available(monkeypatch):
    _no_providers_available(monkeypatch)
    monkeypatch.delenv("AI_PROVIDER", raising=False)
    assert isinstance(select_provider(), KeywordFallback)


def test_preferred_provider_wins_when_available(monkeypatch):
    # Only google reports available; asking for it should select it.
    for name, cls in _REGISTRY.items():
        monkeypatch.setattr(cls, "available", lambda self, n=name: n == "google")
    assert select_provider("google").name == "google"


def test_unknown_preferred_is_ignored_not_crashed(monkeypatch):
    _no_providers_available(monkeypatch)
    # A bogus preferred name must not raise; it just falls through to fallback.
    assert isinstance(select_provider("does-not-exist"), KeywordFallback)


class _Boom:
    """A provider that always fails, to force failover."""
    name = "boom"

    def available(self) -> bool:
        return True

    def structured(self, **kwargs):
        raise RuntimeError("credit balance too low")


class _Works:
    name = "works"

    def __init__(self, out):
        self._out = out

    def available(self) -> bool:
        return True

    def structured(self, **kwargs):
        return self._out


def test_failover_skips_a_broken_provider_to_a_working_one():
    """A dead primary (e.g. out of credit) must fail over, not 503 the feature."""
    good = MoniIntent(template_id="payroll", confidence=0.9)
    chain = FailoverProvider([_Boom(), _Works(good)], KeywordFallback())
    assert chain.name == "boom"  # reports the primary
    out = chain.structured(system="", user="", message="pay staff", schema=MoniIntent)
    assert out is good  # served by the working provider after the primary failed


def test_failover_all_real_fail_then_keyword_classifies():
    chain = FailoverProvider([_Boom(), _Boom()], KeywordFallback())
    out = chain.structured(system="", user="", message="invoice my client", schema=MoniIntent)
    assert isinstance(out, MoniIntent) and out.template_id == "invoice"


def test_select_provider_returns_a_failover_chain_when_available(monkeypatch):
    for name, cls in _REGISTRY.items():
        monkeypatch.setattr(cls, "available", lambda self, n=name: n in ("openai", "google"))
    monkeypatch.delenv("AI_PROVIDER", raising=False)
    chain = select_provider()
    assert isinstance(chain, FailoverProvider)
    assert [p.name for p in chain._providers] == ["openai", "google"]


def test_keyword_fallback_classifies_but_cannot_compose():
    kw = KeywordFallback()
    assert kw.available() is True
    # It can classify intent...
    intent = kw.structured(system="", user="", message="pay my staff salaries",
                           schema=MoniIntent)
    assert isinstance(intent, MoniIntent) and intent.template_id == "payroll"
    # ...but must refuse to compose a full flow (only a real model may, D18).
    with pytest.raises(NotImplementedError):
        kw.structured(system="", user="", message="ajo", schema=MoniFlow)

"""Provider selection + fallback reliability (#106): no coverage existed."""

from __future__ import annotations

import pytest

from monnify_studio.ai.providers import (
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

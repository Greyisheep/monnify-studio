"""A composed flow's notify must reach a real inbox in the demo (#231 follow-up).

The composer seeds a placeholder customer email on initialize, so without a
fallback the demo email would send into example.com and nobody would see it.
"""

from __future__ import annotations

import monnify_studio.executor.adapter as adapter


def test_real_config_email_wins(monkeypatch) -> None:
    monkeypatch.setattr(adapter, "_DEMO_NOTIFY_EMAIL", "demo@studio.test")
    assert adapter._notify_email({"email": "dev@real.com"}, {}) == "dev@real.com"


def test_placeholder_upstream_email_is_skipped_for_the_demo_fallback(monkeypatch) -> None:
    monkeypatch.setattr(adapter, "_DEMO_NOTIFY_EMAIL", "demo@studio.test")
    # The composer's default customer_email is a placeholder, so the fallback wins.
    got = adapter._notify_email({}, {"customer_email": "customer@example.com"})
    assert got == "demo@studio.test"


def test_real_upstream_email_beats_fallback(monkeypatch) -> None:
    monkeypatch.setattr(adapter, "_DEMO_NOTIFY_EMAIL", "demo@studio.test")
    got = adapter._notify_email({}, {"customer_email": "buyer@gmail.com"})
    assert got == "buyer@gmail.com"


def test_no_recipient_and_no_fallback_is_empty(monkeypatch) -> None:
    monkeypatch.setattr(adapter, "_DEMO_NOTIFY_EMAIL", "")
    assert adapter._notify_email({}, {"customer_email": "customer@example.com"}) == ""

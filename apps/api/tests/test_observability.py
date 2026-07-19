"""Observability guarantees: JSON logs carry ids and never leak secrets (#32)."""

from __future__ import annotations

import io
import json

from monnify_studio.observability import (
    configure_logging,
    configure_tracing,
    correlation,
    get_logger,
    register_secret,
    traced,
)


def _last_json(stream: io.StringIO) -> dict:
    lines = [line for line in stream.getvalue().splitlines() if line.strip()]
    return json.loads(lines[-1])


def test_logs_are_json_with_level_and_timestamp():
    buf = io.StringIO()
    configure_logging(stream=buf)
    get_logger("t").info("hello", foo="bar")
    rec = _last_json(buf)
    assert rec["event"] == "hello"
    assert rec["foo"] == "bar"
    assert rec["level"] == "info"
    assert "timestamp" in rec


def test_correlation_id_is_attached_to_every_line():
    buf = io.StringIO()
    configure_logging(stream=buf)
    with correlation(request_id="req_123"):
        get_logger("t").info("x")
    assert _last_json(buf)["request_id"] == "req_123"


def test_trace_id_present_inside_a_span():
    configure_tracing(console=False)
    buf = io.StringIO()
    configure_logging(stream=buf)
    with traced("op"):
        get_logger("t").info("x")
    rec = _last_json(buf)
    assert len(rec["trace_id"]) == 32
    assert len(rec["span_id"]) == 16


def test_sensitive_keys_are_redacted():
    buf = io.StringIO()
    configure_logging(stream=buf)
    get_logger("t").info("x", api_key="abc123def", authorization="Bearer zzz")
    rec = _last_json(buf)
    assert rec["api_key"] == "[REDACTED]"
    assert rec["authorization"] == "[REDACTED]"


def test_registered_secret_is_scrubbed_from_messages():
    register_secret("sk_live_supersecret")
    buf = io.StringIO()
    configure_logging(stream=buf)
    get_logger("t").info("calling monnify", note="used key sk_live_supersecret today")
    rec = _last_json(buf)
    assert "sk_live_supersecret" not in rec["note"]
    assert "[REDACTED]" in rec["note"]

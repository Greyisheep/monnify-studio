"""Observability: structured logs, tracing, and secret redaction (#32, D15).

Call `configure_observability()` once at process start. Then use `get_logger()`
for JSON logs, `traced(...)` to open spans, and `correlation(...)` to tag a unit
of work. Trace context propagates automatically across the API, executor, and
provider adapters, and every log line carries the active trace id.
"""

from __future__ import annotations

from typing import TextIO

from opentelemetry.sdk.trace.export import SpanExporter

from .context import correlation, new_id
from .logging import configure_logging, get_logger
from .redaction import REDACTED, register_secret
from .tracing import (
    configure_tracing,
    get_tracer,
    instrument_fastapi,
    instrument_httpx,
    traced,
)


def configure_observability(
    *,
    stream: TextIO | None = None,
    service_name: str = "monnify-studio",
    console_spans: bool = True,
    span_exporters: list[SpanExporter] | None = None,
) -> None:
    """One-call setup: JSON logging + tracing. Call once at startup."""
    configure_tracing(service_name=service_name, console=console_spans, exporters=span_exporters)
    configure_logging(stream=stream)


__all__ = [
    "REDACTED",
    "configure_logging",
    "configure_observability",
    "configure_tracing",
    "correlation",
    "get_logger",
    "get_tracer",
    "instrument_fastapi",
    "instrument_httpx",
    "new_id",
    "register_secret",
    "traced",
]

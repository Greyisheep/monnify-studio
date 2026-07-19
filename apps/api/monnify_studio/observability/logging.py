"""Structured JSON logging, correlated with trace ids (#32, D15).

Every log line is one JSON object carrying: level, ISO timestamp, any bound
correlation ids (request_id, execution_id), and the active OpenTelemetry
trace_id / span_id when inside a span. Secrets are redacted last, so nothing
sensitive survives into the output.
"""

from __future__ import annotations

import logging
import sys
from typing import Any, TextIO

import structlog
from opentelemetry import trace

from .redaction import redact_processor


def _add_trace_ids(logger: Any, method_name: str, event_dict: dict) -> dict:
    """Attach the current trace/span id so logs and traces line up."""
    span = trace.get_current_span()
    ctx = span.get_span_context() if span is not None else None
    if ctx is not None and ctx.is_valid:
        event_dict["trace_id"] = format(ctx.trace_id, "032x")
        event_dict["span_id"] = format(ctx.span_id, "016x")
    return event_dict


def configure_logging(*, stream: TextIO | None = None, level: int = logging.INFO) -> None:
    """Configure structlog to emit redacted JSON. Idempotent; tests re-call it."""
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            _add_trace_ids,
            redact_processor,  # must run last, just before rendering
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(file=stream or sys.stdout),
        cache_logger_on_first_use=False,
    )


def get_logger(name: str = "monnify_studio") -> Any:
    return structlog.get_logger(name)

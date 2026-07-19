"""Correlation context for traceable, correlated logs (#32, D15).

Built on structlog's contextvars so a bound correlation id (request id, execution
id, ...) appears on every log line emitted within the same sync or async context,
and is cleared cleanly afterwards. This is the log-side half of context
propagation; OpenTelemetry carries the trace-side half (see tracing.py).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager

import structlog


def new_id(prefix: str) -> str:
    """A short, readable correlation id, e.g. `req_9f3a1c2b4d5e`."""
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


@contextmanager
def correlation(**fields: str) -> Iterator[None]:
    """Bind correlation fields for the duration of the block.

    Example: `with correlation(request_id=new_id("req")): ...` tags every log
    emitted inside with that request id."""
    tokens = structlog.contextvars.bind_contextvars(**fields)
    try:
        yield
    finally:
        structlog.contextvars.reset_contextvars(**tokens)

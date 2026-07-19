"""OpenTelemetry tracing with context propagation (#32, D15).

One tracer provider for the process. Spans propagate context automatically, so a
request that flows API -> executor -> Monnify adapter shows up as one trace. We
keep our own reference to the provider (rather than only the OTel global) so the
setup is idempotent and easy to point at an in-memory exporter in tests.

Console exporter by default; set `OTEL_EXPORTER_OTLP_ENDPOINT` to also ship spans
to a collector (Jaeger, Tempo, ...) with no code change and no vendor lock-in.
"""

from __future__ import annotations

import os
from collections.abc import Iterator, Sequence
from contextlib import contextmanager

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor,
    ConsoleSpanExporter,
    SimpleSpanProcessor,
    SpanExporter,
)

_provider: TracerProvider | None = None


def configure_tracing(
    *,
    service_name: str = "monnify-studio",
    console: bool = True,
    exporters: Sequence[SpanExporter] | None = None,
) -> TracerProvider:
    """Build and install the tracer provider. Safe to call again (tests do)."""
    global _provider
    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    if console:
        provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if endpoint:
        try:  # optional dependency; only if the collector is configured
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

            provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint)))
        except ImportError:
            pass
    for exporter in exporters or ():
        provider.add_span_processor(SimpleSpanProcessor(exporter))
    _provider = provider
    return provider


def get_tracer(name: str = "monnify_studio") -> trace.Tracer:
    if _provider is not None:
        return _provider.get_tracer(name)
    return trace.get_tracer(name)


@contextmanager
def traced(span_name: str, **attributes: object) -> Iterator[trace.Span]:
    """Run a block inside a span. Attributes are attached for filtering later."""
    tracer = get_tracer()
    with tracer.start_as_current_span(span_name) as span:
        for key, value in attributes.items():
            span.set_attribute(key, value)
        yield span


def instrument_fastapi(app: object) -> None:
    """Auto-instrument a FastAPI app (call once the API exists, #7 / Phase 1.0)."""
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

    FastAPIInstrumentor.instrument_app(app, tracer_provider=_provider)


def instrument_httpx() -> None:
    """Auto-instrument httpx so Monnify adapter calls appear as child spans."""
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

    HTTPXClientInstrumentor().instrument(tracer_provider=_provider)

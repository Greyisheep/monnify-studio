"""FastAPI application factory (#4 support, Phase 1.0).

Wires observability first (so requests are traced and logged), enables CORS for
the Next.js dev server, and mounts the routes. Auto-instrumentation is optional:
if the OpenTelemetry FastAPI package is absent, the app still runs.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..config import get_settings
from ..observability import configure_observability, get_logger, instrument_fastapi, register_secret
from .routes import router

log = get_logger("api")


def create_app() -> FastAPI:
    configure_observability(console_spans=False)
    settings = get_settings()
    register_secret(settings.monnify_api_key)
    register_secret(settings.monnify_secret_key)

    app = FastAPI(title="Monnify Studio API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)

    try:
        instrument_fastapi(app)
    except ImportError:
        log.warning("otel.fastapi.not_installed", detail="tracing spans for HTTP requests disabled")

    log.info("api.ready")
    return app


app = create_app()

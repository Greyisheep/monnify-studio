"""Show structured, traced, redacted logs around a real analysis run (#32).

    python scripts/demo_observability.py

Emits JSON logs that carry a request id (correlation) and the active trace/span
ids, and proves a secret is scrubbed even when it is accidentally logged. The
console span exporter also prints the span, so you can see the trace.
"""

from __future__ import annotations

from monnify_studio.analysis import analyze
from monnify_studio.fixtures import unsafe_marketplace
from monnify_studio.observability import (
    configure_observability,
    correlation,
    get_logger,
    new_id,
    register_secret,
    traced,
)
from monnify_studio.providers import default_catalog


def main() -> int:
    configure_observability()
    register_secret("sk_live_pretend_monnify_key")  # as if loaded from the env
    log = get_logger("demo")

    with correlation(request_id=new_id("req")):
        log.info("analysis.requested", workflow="marketplace-unsafe")
        with traced("analyze", workflow="marketplace-unsafe"):
            report = analyze(unsafe_marketplace(), default_catalog())
            log.info(
                "analysis.completed",
                findings=len(report.findings),
                criticals=report.criticals,
                # Both of these must come out redacted:
                authorization="Bearer sk_live_pretend_monnify_key",
                note="verified with key sk_live_pretend_monnify_key",
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

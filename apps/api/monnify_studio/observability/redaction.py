"""Secret redaction for logs (#32, D15).

No secret value should ever reach a log line, a shared trace, or an exported
project (security standard). Two defences, applied to every log event:

  1. key-based: any field whose name looks sensitive (api_key, secret, token,
     authorization, ...) has its value replaced with [REDACTED].
  2. value-based: any secret registered via `register_secret` is scrubbed out of
     every string field, even if it was accidentally interpolated into a message.
"""

from __future__ import annotations

from typing import Any

REDACTED = "[REDACTED]"

_SENSITIVE_KEY_PARTS = (
    "authorization",
    "api_key",
    "apikey",
    "secret",
    "token",
    "password",
    "access_key",
    "private_key",
    "cookie",
)

# Registered secret values, scrubbed from any string we log.
_secrets: set[str] = set()


def register_secret(value: str | None) -> None:
    """Register a secret value (e.g. a Monnify key) so it is scrubbed from logs.

    Short values are ignored to avoid redacting common substrings by accident."""
    if value and len(value) >= 6:
        _secrets.add(value)


def _is_sensitive_key(key: str) -> bool:
    k = key.lower()
    return any(part in k for part in _SENSITIVE_KEY_PARTS)


def _scrub(value: Any) -> Any:
    if isinstance(value, str):
        out = value
        for secret in _secrets:
            if secret in out:
                out = out.replace(secret, REDACTED)
        return out
    if isinstance(value, dict):
        return {k: (REDACTED if _is_sensitive_key(k) else _scrub(v)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return type(value)(_scrub(v) for v in value)
    return value


def redact_processor(logger: Any, method_name: str, event_dict: dict) -> dict:
    """structlog processor: redact sensitive keys and scrub registered secrets."""
    return {k: (REDACTED if _is_sensitive_key(k) else _scrub(v)) for k, v in event_dict.items()}

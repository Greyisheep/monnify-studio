"""Provider-agnostic AI layer (#15, D16).

One `AIProvider` protocol, three LLM adapters (Anthropic default, OpenAI, Google)
plus a deterministic keyword fallback. Selection is by `AI_PROVIDER`, then first
available, then the fallback, so Chat never hard-fails on stage even with no key
(the D11 instinct). SDKs are imported lazily so the module works without them
installed and without any key configured.
"""

from __future__ import annotations

import os
from typing import Protocol

from ..observability import get_logger, register_secret
from .schema import MoniIntent

log = get_logger("ai")

# Default model per the Claude API guidance; overridable via env for testing.
_ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-8")


class AIProvider(Protocol):
    name: str

    def available(self) -> bool: ...

    def infer(self, *, system: str, user: str, message: str) -> MoniIntent: ...


class KeywordFallback:
    """No network, always available. Keeps Chat working with no key (D11)."""

    name = "keyword"

    def available(self) -> bool:
        return True

    def infer(self, *, system: str, user: str, message: str) -> MoniIntent:
        text = message.lower()
        sell = ("sell", "instagram", "whatsapp", "thrift", "store", "shop", "boutique")
        payroll = ("payroll", "salary", "salaries", "staff", "employee", "wages", "pay my")
        if any(w in text for w in payroll):
            return MoniIntent(
                template_id="payroll",
                confidence=0.5,
                explanation="This looks like paying staff. Each beneficiary is validated "
                "before any transfer, so money never goes to a wrong account.",
            )
        if any(w in text for w in sell):
            return MoniIntent(
                template_id="sell-online",
                confidence=0.6,
                explanation="This looks like selling online. Orders are only marked paid "
                "after Monnify confirms the money, so fake transfer screenshots never work.",
            )
        return MoniIntent(
            template_id="unknown",
            confidence=0.0,
            clarifying_question="What do you want to set up? For example: a payment link "
            "for your online shop, or staff payroll.",
        )


def _anthropic_key() -> str | None:
    # The key may live under either name; CLAUDE_API_KEY is how it is provisioned here.
    return os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")


def _google_key() -> str | None:
    return os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")


class AnthropicProvider:
    name = "anthropic"

    def __init__(self) -> None:
        register_secret(_anthropic_key())

    def available(self) -> bool:
        try:
            import anthropic  # noqa: F401
        except ImportError:
            return False
        return bool(_anthropic_key())

    def infer(self, *, system: str, user: str, message: str) -> MoniIntent:
        import anthropic

        client = anthropic.Anthropic(api_key=_anthropic_key())
        resp = client.messages.parse(
            model=_ANTHROPIC_MODEL,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_format=MoniIntent,
        )
        return resp.parsed_output or MoniIntent(template_id="unknown")


class OpenAIProvider:
    name = "openai"

    def __init__(self) -> None:
        register_secret(os.getenv("OPENAI_API_KEY"))

    def available(self) -> bool:
        try:
            import openai  # noqa: F401
        except ImportError:
            return False
        return bool(os.getenv("OPENAI_API_KEY"))

    def infer(self, *, system: str, user: str, message: str) -> MoniIntent:
        from openai import OpenAI

        client = OpenAI()
        completion = client.beta.chat.completions.parse(
            model=os.getenv("OPENAI_MODEL", "gpt-5"),
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format=MoniIntent,
        )
        return completion.choices[0].message.parsed or MoniIntent(template_id="unknown")


class GoogleProvider:
    """Uses the current google-genai SDK (successor to google-generativeai)."""

    name = "google"

    def __init__(self) -> None:
        register_secret(_google_key())

    def available(self) -> bool:
        try:
            from google import genai  # noqa: F401
        except ImportError:
            return False
        return bool(_google_key())

    def infer(self, *, system: str, user: str, message: str) -> MoniIntent:
        from google import genai

        client = genai.Client(api_key=_google_key())
        resp = client.models.generate_content(
            # Verified live against this key: gemini-3.1-pro-preview is the top
            # available Pro model (#15).
            model=os.getenv("GOOGLE_MODEL", "gemini-3.1-pro-preview"),
            contents=f"{system}\n\n{user}",
            config={
                "response_mime_type": "application/json",
                "response_schema": MoniIntent,
            },
        )
        parsed = getattr(resp, "parsed", None)
        if isinstance(parsed, MoniIntent):
            return parsed
        return MoniIntent.model_validate_json(resp.text)


_ORDER = ["anthropic", "openai", "google"]
_REGISTRY: dict[str, type] = {
    "anthropic": AnthropicProvider,
    "openai": OpenAIProvider,
    "google": GoogleProvider,
}


def select_provider(preferred: str | None = None) -> AIProvider:
    """First available provider (preferred, then env default, then order), else fallback."""
    order: list[str] = []
    for candidate in (preferred, os.getenv("AI_PROVIDER"), *_ORDER):
        if candidate and candidate in _REGISTRY and candidate not in order:
            order.append(candidate)
    for name in order:
        provider = _REGISTRY[name]()
        if provider.available():
            log.info("ai.provider.selected", provider=name)
            return provider
    log.info("ai.provider.selected", provider="keyword")
    return KeywordFallback()

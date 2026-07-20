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
from pydantic import BaseModel

from .schema import MoniIntent

log = get_logger("ai")

# Default model per the Claude API guidance; overridable via env for testing.
_ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")

# Hard per-call timeout (#106): without it the SDK default is ~600s, and since
# these run on synchronous endpoints a provider hang would block the worker for
# minutes AND defeat the fallbacks, which only fire on an exception, not a stall.
_TIMEOUT_S = float(os.getenv("AI_TIMEOUT_S", "25"))


class AIProvider(Protocol):
    name: str

    def available(self) -> bool: ...

    def structured(
        self, *, system: str, user: str, message: str = "",
        schema: type[BaseModel] = MoniIntent, max_tokens: int = 1024,
    ) -> BaseModel: ...


class KeywordFallback:
    """No network, always available. Keeps Chat working with no key (D11)."""

    name = "keyword"

    def available(self) -> bool:
        return True

    def structured(
        self, *, system: str, user: str, message: str = "",
        schema: type[BaseModel] = MoniIntent, max_tokens: int = 1024,
    ) -> BaseModel:
        if schema is not MoniIntent:
            # Composition needs a real model; the fallback only classifies (D18).
            raise NotImplementedError("keyword fallback cannot compose flows")
        text = message.lower()
        sell = ("sell", "instagram", "whatsapp", "thrift", "store", "shop", "boutique")
        invoice = ("invoice", "bill my client", "billing", "receipt for", "invoice link")
        if any(w in text for w in invoice):
            return MoniIntent(
                template_id="invoice",
                confidence=0.6,
                explanation="This looks like billing a client. Create an invoice, share "
                "the link, and it is only marked paid after Monnify confirms the money "
                "in your account.",
            )
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

    def structured(
        self, *, system: str, user: str, message: str = "",
        schema: type[BaseModel] = MoniIntent, max_tokens: int = 1024,
    ) -> BaseModel:
        import anthropic

        client = anthropic.Anthropic(api_key=_anthropic_key(), timeout=_TIMEOUT_S)
        resp = client.messages.parse(
            model=_ANTHROPIC_MODEL,
            max_tokens=max_tokens,
            # Constrained extraction, not deep reasoning: disabling thinking frees
            # the whole token budget for the JSON (so large flows do not truncate)
            # and cuts latency from ~30s to a few seconds (#15 compose robustness).
            thinking={"type": "disabled"},
            system=system,
            messages=[{"role": "user", "content": user}],
            output_format=schema,
        )
        if resp.parsed_output is None:
            raise ValueError("empty structured output")
        return resp.parsed_output


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

    def structured(
        self, *, system: str, user: str, message: str = "",
        schema: type[BaseModel] = MoniIntent, max_tokens: int = 1024,
    ) -> BaseModel:
        from openai import OpenAI

        client = OpenAI(timeout=_TIMEOUT_S)
        completion = client.beta.chat.completions.parse(
            model=os.getenv("OPENAI_MODEL", "gpt-5-mini"),
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format=schema,
        )
        parsed = completion.choices[0].message.parsed
        if parsed is None:
            raise ValueError("empty structured output")
        return parsed


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

    def structured(
        self, *, system: str, user: str, message: str = "",
        schema: type[BaseModel] = MoniIntent, max_tokens: int = 1024,
    ) -> BaseModel:
        from google import genai

        client = genai.Client(
            api_key=_google_key(),
            http_options={"timeout": int(_TIMEOUT_S * 1000)},  # genai timeout is ms
        )
        resp = client.models.generate_content(
            # gemini-flash-latest tracks the newest Flash on this key (#15).
            model=os.getenv("GOOGLE_MODEL", "gemini-flash-latest"),
            contents=f"{system}\n\n{user}",
            config={
                "response_mime_type": "application/json",
                "response_schema": schema,
            },
        )
        parsed = getattr(resp, "parsed", None)
        if isinstance(parsed, schema):
            return parsed
        return schema.model_validate_json(resp.text)


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

"""Provider-agnostic LLM client (D16). Offline canned fallback when no key."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass
from typing import Literal, Protocol

import httpx

from monnify_studio.ai.guardrails import CHAT_SYSTEM
from monnify_studio.observability import get_logger

log = get_logger("ai.llm")

ProviderName = Literal["anthropic", "openai", "google", "canned"]


@dataclass(frozen=True)
class LlmMessage:
    role: Literal["system", "user", "assistant"]
    content: str


class LlmClient(Protocol):
    name: str

    def complete(self, messages: list[LlmMessage]) -> str: ...

    async def stream(self, messages: list[LlmMessage]) -> AsyncIterator[str]: ...


class CannedLlm:
    """Deterministic offline replies for demos / CI (no API key)."""

    name = "canned"

    def complete(self, messages: list[LlmMessage]) -> str:
        return "".join(self._chunks(messages))

    async def stream(self, messages: list[LlmMessage]) -> AsyncIterator[str]:
        for chunk in self._chunks(messages):
            yield chunk

    def _chunks(self, messages: list[LlmMessage]) -> Iterator[str]:
        user = next((m.content for m in reversed(messages) if m.role == "user"), "")
        lower = user.lower()
        if "why" in lower and ("node" in lower or "here" in lower):
            text = (
                "That node is part of the payment state machine (D1). "
                "Safety nodes (verify, signature, idempotency) are first-class "
                "so Architecture Review can prove reachability (D3/D9). "
                "Open a finding in Review for a MON-rule explanation."
            )
        elif "mon00" in lower or "finding" in lower or "critical" in lower:
            text = (
                "Findings come from the deterministic analyzer (tag reachability), "
                "not from me. Critical usually means client-callback-as-truth "
                "(MON001) or missing webhook signature/idempotency (MON002/MON003). "
                "Use Apply Fix to insert the safety nodes, then Re-analyze."
            )
        elif "marketplace" in lower or "split" in lower or "design" in lower:
            text = (
                "For marketplace payout-after-fulfilment, prefer ledger-hold + "
                "transfer after fulfilment — not immediate split (MON009 / D10). "
                "Try Design mode: “marketplace with payout after fulfilment”."
            )
        else:
            text = (
                "I can explain this workflow’s nodes and Architecture Review "
                "findings, or design a starter IR from a product description. "
                "(Offline canned assistant — set AI_PROVIDER + API key for live models.)"
            )
        # Emit in a few pieces so the SSE path is exercised in tests.
        mid = max(1, len(text) // 3)
        yield text[:mid]
        yield text[mid : mid * 2]
        yield text[mid * 2 :]


class AnthropicLlm:
    """Messages API via httpx (no SDK dep). Streams text deltas."""

    name = "anthropic"
    _url = "https://api.anthropic.com/v1/messages"

    def __init__(self, api_key: str, model: str = "claude-haiku-4-5-20251001") -> None:
        self._api_key = api_key
        self._model = model

    def _payload(self, messages: list[LlmMessage], *, stream: bool) -> dict:
        system = "\n\n".join(m.content for m in messages if m.role == "system") or CHAT_SYSTEM
        turns = [
            {"role": m.role, "content": m.content}
            for m in messages
            if m.role in ("user", "assistant")
        ]
        return {
            "model": self._model,
            "max_tokens": 1024,
            "system": system,
            "messages": turns,
            "stream": stream,
        }

    def complete(self, messages: list[LlmMessage]) -> str:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                self._url,
                headers=self._headers(),
                json=self._payload(messages, stream=False),
            )
            response.raise_for_status()
            body = response.json()
        parts = [
            block.get("text", "")
            for block in body.get("content", [])
            if block.get("type") == "text"
        ]
        return "".join(parts)

    async def stream(self, messages: list[LlmMessage]) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                self._url,
                headers=self._headers(),
                json=self._payload(messages, stream=True),
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if not raw or raw == "[DONE]":
                        continue
                    try:
                        event = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    if event.get("type") == "content_block_delta":
                        delta = event.get("delta") or {}
                        text = delta.get("text")
                        if text:
                            yield text

    def _headers(self) -> dict[str, str]:
        return {
            "x-api-key": self._api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }


def get_llm_client(
    provider: str = "anthropic",
    *,
    anthropic_api_key: str = "",
    openai_api_key: str = "",
    google_api_key: str = "",
) -> LlmClient:
    """Resolve AI_PROVIDER. Missing keys fall back to canned (demo-safe)."""
    name = (provider or "anthropic").strip().lower()
    if name == "anthropic" and anthropic_api_key:
        log.info("ai.llm.selected", provider="anthropic")
        return AnthropicLlm(anthropic_api_key)
    if name == "openai" and openai_api_key:
        # Stubbed: OpenAI path not wired yet — fall through to canned with notice.
        log.warning("ai.llm.openai_unwired", hint="falling back to canned")
    if name == "google" and google_api_key:
        log.warning("ai.llm.google_unwired", hint="falling back to canned")
    if name == "canned":
        pass
    elif name in ("openai", "google") or (
        name == "anthropic" and not anthropic_api_key
    ):
        log.info("ai.llm.selected", provider="canned", reason="missing_or_unwired_key")
    else:
        log.info("ai.llm.selected", provider="canned", reason=f"unknown:{name}")
    return CannedLlm()

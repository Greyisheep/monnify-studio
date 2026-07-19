"""Chat streaming: grounded Q&A over workflow + findings (#15 Slice A)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING

from monnify_studio.ai.guardrails import (
    CHAT_SYSTEM,
    findings_context,
    workflow_context,
)
from monnify_studio.ai.llm import LlmClient, LlmMessage
from monnify_studio.ai.models import ChatRequest
from monnify_studio.analysis import Report, analyze
from monnify_studio.providers.base import Catalog

if TYPE_CHECKING:
    pass


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def stream_chat_events(
    body: ChatRequest,
    llm: LlmClient,
    catalog: Catalog,
) -> AsyncIterator[str]:
    """Yield SSE frames: token*, message, done."""
    report: Report | None = None
    if body.workflow is not None:
        report = analyze(body.workflow, catalog)

    context = (
        f"{workflow_context(body.workflow, body.selected_node_id)}\n\n"
        f"{findings_context(report)}"
    )
    messages: list[LlmMessage] = [
        LlmMessage(role="system", content=CHAT_SYSTEM),
        LlmMessage(
            role="user",
            content=f"Studio context:\n{context}\n\nAnswer the next user message.",
        ),
    ]
    for turn in body.history[-12:]:
        messages.append(LlmMessage(role=turn.role, content=turn.content))
    messages.append(LlmMessage(role="user", content=body.message))

    parts: list[str] = []
    try:
        async for token in llm.stream(messages):
            parts.append(token)
            yield _sse("token", {"text": token})
    except Exception as exc:  # noqa: BLE001 - surface to client, keep stream clean
        yield _sse("error", {"message": str(exc)})
        yield _sse("done", {})
        return

    text = "".join(parts)
    yield _sse(
        "message",
        {
            "role": "assistant",
            "content": text,
            "provider": getattr(llm, "name", "unknown"),
        },
    )
    yield _sse("done", {})

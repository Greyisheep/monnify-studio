"""Constrained AI architecture assistant (#15, D16).

LLM providers live here — not in `providers/` (that package is the payment
node catalog, D13). Guardrails: no secrets in context, no financial decisions.
"""

from .chat import stream_chat_events
from .design import DesignResult, design_from_intent
from .llm import LlmClient, get_llm_client

__all__ = [
    "DesignResult",
    "LlmClient",
    "design_from_intent",
    "get_llm_client",
    "stream_chat_events",
]

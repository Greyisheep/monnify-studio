"""Ask Moni "why": answers grounded in the real Monnify docs (#75, D20).

When a user questions a node or pattern while building, Moni answers from two
grounded inputs: the catalog's cheat-sheet grounding (#25) and a live fetch of
the node's official doc page on developers.monnify.com. Sources are assembled
by US from the catalog, never taken from model output, so a reference can never
be an invented URL. With no AI key, the grounding itself is the answer (D11).

Per the RAG steelman (#25 discussion): this surface is doc *lookup*, not
retrieval infrastructure. No vector index; the catalog knows which page matters.
"""

from __future__ import annotations

import re

import httpx
from pydantic import BaseModel, Field

from ..observability import get_logger
from ..providers import default_catalog
from .providers import AIProvider, select_provider
from .schema import MoniAnswer

log = get_logger("ai.explain")

_SYSTEM = (
    "You are Moni, the assistant inside Monnify Studio. The user is building a "
    "payment flow and asked a question. Answer plainly and concretely for a "
    "Nigerian small-business or developer audience, in at most three short "
    "paragraphs. Ground your answer ONLY in the provided catalog context and "
    "official documentation excerpt; if they do not cover the question, say so "
    "briefly rather than guessing. Do not output URLs; references are attached "
    "separately by the application."
)

_DOC_CACHE: dict[str, str] = {}
_TAG_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.DOTALL | re.IGNORECASE)
_HTML_RE = re.compile(r"<[^>]+>")
# References live only in `sources` (assembled from the catalog); any URL in the
# model's prose is stripped so it cannot smuggle an invented citation (#106).
_URL_RE = re.compile(r"https?://\S+")


class Source(BaseModel):
    title: str
    url: str


class Explanation(BaseModel):
    answer: str
    sources: list[Source] = Field(default_factory=list)


def _fetch_doc(url: str, *, limit: int = 3500) -> str:
    """Best-effort fetch of an official doc page as plain text (cached).

    A miss is never fatal; the catalog grounding still carries the answer."""
    if url in _DOC_CACHE:
        return _DOC_CACHE[url]
    try:
        resp = httpx.get(url, timeout=6.0, follow_redirects=True)
        resp.raise_for_status()
        text = _TAG_RE.sub(" ", resp.text)
        text = _HTML_RE.sub(" ", text)
        text = re.sub(r"\s+", " ", text).strip()[:limit]
    except Exception as exc:  # noqa: BLE001 - degrade to catalog grounding
        # Do NOT cache the failure: a single transient blip must not permanently
        # degrade this node's answers to grounding-only for the process life (#106).
        log.info("explain.doc_fetch_failed", url=url, error=type(exc).__name__)
        return ""
    _DOC_CACHE[url] = text
    return text


def explain(
    question: str,
    *,
    node_type: str | None = None,
    workflow_summary: str = "",
    provider: str | None = None,
) -> tuple[Explanation, str]:
    """Answer a builder's "why", returning (explanation, provider_name)."""
    catalog = default_catalog()
    context: list[str] = []
    sources: list[Source] = []

    if node_type:
        d = catalog.resolve(node_type)  # KeyError -> 404 at the API layer
        context.append(f"Node: {d.title}. When to use (per Monnify docs): {d.when_to_use or d.description}")
        if d.doc_url:
            sources.append(Source(title=f"Monnify docs: {d.title}", url=d.doc_url))
            excerpt = _fetch_doc(d.doc_url)
            if excerpt:
                context.append(f"Official documentation excerpt: {excerpt}")
    if workflow_summary:
        context.append(f"The user's current flow: {workflow_summary}")
    if not sources:
        sources.append(Source(title="Monnify developer documentation", url="https://developers.monnify.com/"))

    chosen: AIProvider = select_provider(provider)
    grounded = "\n\n".join(context) if context else "(no node context supplied)"
    user = f"{grounded}\n\nQuestion: {question.strip()}"
    try:
        result = chosen.structured(system=_SYSTEM, user=user, message="", schema=MoniAnswer, max_tokens=1024)
        answer = result.answer.strip() if isinstance(result, MoniAnswer) else ""
        # Citations only ever come from the catalog via `sources`; strip any URL
        # the model slipped into the prose so it cannot pass off an invented link.
        answer = _URL_RE.sub("", answer)
        answer = re.sub(r"\s{2,}", " ", answer).strip()
    except Exception as exc:  # noqa: BLE001 - the grounding is still a real answer (D11)
        log.info("explain.provider_failed", provider=chosen.name, error=type(exc).__name__)
        answer = ""
    if not answer:
        # Deterministic fallback: the documented grounding IS the answer.
        base = context[0] if context else "See the official Monnify documentation."
        answer = f"{base} See the linked official docs for the full details."
        return Explanation(answer=answer, sources=sources), f"{chosen.name}->grounding"
    return Explanation(answer=answer, sources=sources), chosen.name

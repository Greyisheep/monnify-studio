"""Request/response shapes for the assistant HTTP surface (#15)."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from monnify_studio.analysis import Report
from monnify_studio.ir.models import Workflow


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    workflow: Optional[Workflow] = None
    selected_node_id: Optional[str] = None
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)


class DesignRequest(BaseModel):
    intent: str = Field(min_length=1, max_length=4000)
    apply_safe: bool = False


class DesignResultBody(BaseModel):
    """Intent → IR result after schema validate + analyzer gate (D16)."""

    workflow: Optional[Workflow] = None
    node_types: dict = Field(default_factory=dict)
    analysis: Optional[Report] = None
    source: Literal["canned", "llm"] = "canned"
    template_id: Optional[str] = None
    clarifications: list[str] = Field(default_factory=list)
    summary: str = ""

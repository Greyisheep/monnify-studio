"""Execution-trace event shapes for the IR interpreter (#8, D2).

These are what the #28 trace viewer consumes over SSE. Payloads must already be
redacted before they land here (D15).
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class RunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    WAITING = "waiting"
    COMPLETED = "completed"
    FAILED = "failed"


class ExecutionEventType(str, Enum):
    RUN_STARTED = "run.started"
    RUN_COMPLETED = "run.completed"
    RUN_FAILED = "run.failed"
    NODE_STARTED = "node.started"
    NODE_WAITING = "node.waiting"
    NODE_COMPLETED = "node.completed"
    NODE_FAILED = "node.failed"
    LOG = "log"


class ExecutionEvent(BaseModel):
    """One step in a run's trace. Same shape from MockAdapter and MonnifyAdapter."""

    id: str = Field(default_factory=lambda: uuid4().hex)
    run_id: str
    seq: int
    type: ExecutionEventType
    ts: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    node_id: Optional[str] = None
    node_type: Optional[str] = None
    message: str = ""
    # Plain-words version of what happened, safe to show non-developers
    # (kid-lens, #79). Technical detail stays in `message`.
    friendly_text: str = ""
    duration_ms: Optional[int] = None
    # Redacted HTTP-ish envelopes + outputs for the trace viewer (#28).
    request: Optional[dict[str, Any]] = None
    response: Optional[dict[str, Any]] = None
    outputs: dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None


class ExecutionRun(BaseModel):
    id: str
    workflow_id: str
    adapter: str
    status: RunStatus = RunStatus.PENDING
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: Optional[datetime] = None
    error: Optional[str] = None

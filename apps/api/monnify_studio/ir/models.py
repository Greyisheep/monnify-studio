"""The Intermediate Representation: a typed, event-driven node graph.

Design (locked decisions):
  * D1  — event-driven state machine: `event.*` / wait nodes are async
          suspension points; the executor treats them as machine pauses.
  * D9  — safety concerns are first-class *nodes*, not hidden edge metadata.
  * D13 — provider-agnostic: a `Node.type` is just a catalog key; this module
          has no knowledge of Monnify.

Two orthogonal concerns, two mechanisms (kept deliberately separate):
  * **Edges** describe the *execution graph* (who runs after whom, branches,
    async event transitions). The analyzer walks edges for reachability.
  * **Data references** (`${node.port}` / `${var.name}` inside `Node.inputs`)
    describe *typed data flow*. The type checker validates these.

Traceability: #3 (P1.1 — The IR); decisions D1, D9, D13.
"""

from __future__ import annotations

import re
from typing import Optional

from pydantic import BaseModel, Field

from .types import CapabilityTag, DomainType

# A data reference looks like "${initialize.checkout_url}" or "${var.order_id}".
_REF_RE = re.compile(r"^\$\{([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\}$")


class DataRef:
    """Parsed `${producer.port}` reference. `producer` may be a node id or 'var'."""

    def __init__(self, producer: str, port: str) -> None:
        self.producer = producer
        self.port = port

    @classmethod
    def parse(cls, expr: str) -> Optional["DataRef"]:
        m = _REF_RE.match(expr.strip()) if isinstance(expr, str) else None
        return cls(m.group(1), m.group(2)) if m else None

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"${{{self.producer}.{self.port}}}"


class Variable(BaseModel):
    name: str
    type: DomainType = DomainType.ANY
    description: str = ""


class Position(BaseModel):
    x: float = 0.0
    y: float = 0.0


class Node(BaseModel):
    """A single step. Its type resolves to a catalog `NodeTypeDef` that supplies
    the ports and default capability tags."""

    id: str
    type: str  # catalog key, e.g. "monnify.verify_transaction"
    label: Optional[str] = None
    config: dict = Field(default_factory=dict)
    # port -> expression. Either a `${...}` reference or a literal value.
    inputs: dict[str, str] = Field(default_factory=dict)
    # tags a *specific* node adds beyond its type's defaults (rarely needed).
    extra_tags: list[CapabilityTag] = Field(default_factory=list)
    position: Position = Field(default_factory=Position)


class Edge(BaseModel):
    """A control-flow connection. `kind='event'` marks an async transition out
    of a wait/event node (the state-machine edges, per D1)."""

    source: str
    target: str
    kind: str = "control"  # "control" | "event"
    # Branch label ("true"/"false") or the event name that fires this edge.
    condition: Optional[str] = None


class Workflow(BaseModel):
    id: str
    name: str
    version: int = 1
    provider: str = "monnify"  # which provider pack this workflow draws on
    description: str = ""
    variables: dict[str, Variable] = Field(default_factory=dict)
    nodes: list[Node] = Field(default_factory=list)
    edges: list[Edge] = Field(default_factory=list)
    entrypoint: Optional[str] = None

    # --- convenience accessors (graph shape) ---

    def node(self, node_id: str) -> Node:
        for n in self.nodes:
            if n.id == node_id:
                return n
        raise KeyError(node_id)

    def has_node(self, node_id: str) -> bool:
        return any(n.id == node_id for n in self.nodes)

    def successors(self, node_id: str) -> list[str]:
        return [e.target for e in self.edges if e.source == node_id]

    def predecessors(self, node_id: str) -> list[str]:
        return [e.source for e in self.edges if e.target == node_id]

    def roots(self) -> list[str]:
        """Nodes with no incoming edge — entry points into the graph."""
        targets = {e.target for e in self.edges}
        return [n.id for n in self.nodes if n.id not in targets]

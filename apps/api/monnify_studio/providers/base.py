"""Provider-catalog abstraction (D13).

A `NodeTypeDef` is the contract for one kind of node: its typed ports and its
default capability tags. A `Catalog` is a registry of those defs. The core
(provider-neutral) node types live in `core.py`; each provider — Monnify today,
Paystack/Flutterwave tomorrow — contributes a pack of `monnify.*` / `paystack.*`
defs. Swapping providers is adding a pack, never touching the engine.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from ..ir.models import Node
from ..ir.types import CapabilityTag, DomainType, NodeCategory


class PortSpec(BaseModel):
    name: str
    type: DomainType = DomainType.ANY
    required: bool = True
    description: str = ""


class NodeTypeDef(BaseModel):
    type: str  # catalog key, e.g. "monnify.verify_transaction"
    category: NodeCategory
    title: str
    description: str = ""
    default_tags: list[CapabilityTag] = Field(default_factory=list)
    inputs: list[PortSpec] = Field(default_factory=list)
    outputs: list[PortSpec] = Field(default_factory=list)

    def output(self, name: str) -> PortSpec | None:
        return next((p for p in self.outputs if p.name == name), None)

    def input(self, name: str) -> PortSpec | None:
        return next((p for p in self.inputs if p.name == name), None)


class Catalog:
    """A registry of node type definitions assembled from packs."""

    def __init__(self, defs: list[NodeTypeDef] | None = None) -> None:
        self._defs: dict[str, NodeTypeDef] = {}
        for d in defs or []:
            self.register(d)

    def register(self, definition: NodeTypeDef) -> None:
        if definition.type in self._defs:
            raise ValueError(f"duplicate node type: {definition.type}")
        self._defs[definition.type] = definition

    def register_pack(self, pack: list[NodeTypeDef]) -> "Catalog":
        for d in pack:
            self.register(d)
        return self

    def get(self, node_type: str) -> NodeTypeDef | None:
        return self._defs.get(node_type)

    def resolve(self, node_type: str) -> NodeTypeDef:
        d = self._defs.get(node_type)
        if d is None:
            raise KeyError(f"unknown node type: {node_type}")
        return d

    def types(self) -> list[str]:
        return sorted(self._defs)

    def effective_tags(self, node: Node) -> set[CapabilityTag]:
        """Tags the analyzer sees for a node: its type's defaults plus any the
        specific node adds. The single source of truth for correctness reasoning."""
        d = self.get(node.type)
        base = set(d.default_tags) if d else set()
        return base | set(node.extra_tags)

"""Static-analysis engine: tag-reachability over the IR graph (D3).

The engine reasons ONLY over capability tags - never node `type` strings - so
every rule is provider-agnostic. The workhorse is `unguarded_targets`: "can I
reach a dangerous node from this source without passing a protective node?"
That single primitive expresses most payment-correctness rules.

Traceability: #5 (P1.3 - static analysis engine); decision D3.
"""

from __future__ import annotations

from typing import Callable

from pydantic import BaseModel, Field

from ..ir.models import Workflow
from ..ir.types import CapabilityTag, Severity
from ..providers.base import Catalog

NodePred = Callable[[str], bool]


class Finding(BaseModel):
    rule_id: str
    severity: Severity
    title: str
    message: str  # the concrete risk
    node_ids: list[str] = Field(default_factory=list)  # implicated nodes (canvas highlight)
    path: list[str] = Field(default_factory=list)  # the offending route, if any
    explanation: str = ""
    remediation: str = ""  # what Apply-Fix would insert
    doc_url: str = ""


class Analysis:
    """A workflow paired with its catalog, exposing graph + tag queries."""

    def __init__(self, workflow: Workflow, catalog: Catalog) -> None:
        self.wf = workflow
        self.catalog = catalog
        self._tags: dict[str, set[CapabilityTag]] = {
            n.id: catalog.effective_tags(n) for n in workflow.nodes
        }

    # --- tag queries ---

    def tags(self, node_id: str) -> set[CapabilityTag]:
        return self._tags.get(node_id, set())

    def has_tag(self, node_id: str, tag: CapabilityTag) -> bool:
        return tag in self._tags.get(node_id, set())

    def nodes_with(self, tag: CapabilityTag) -> list[str]:
        return [nid for nid, tags in self._tags.items() if tag in tags]

    def any_with(self, tag: CapabilityTag) -> bool:
        return any(tag in tags for tags in self._tags.values())

    def has_pred(self, tag: CapabilityTag) -> NodePred:
        """Convenience: a predicate that tests for one tag."""
        return lambda nid: self.has_tag(nid, tag)

    # --- the reachability primitive ---

    def unguarded_targets(
        self, source_id: str, is_target: NodePred, is_guard: NodePred
    ) -> list[list[str]]:
        """All paths from `source_id` that reach a `is_target` node without
        passing through a `is_guard` node. A guard node prunes its subtree
        (everything after it is considered protected). Returns offending paths
        (each a list of node ids beginning at the source)."""
        offending: list[list[str]] = []
        # Stack of (node_id, path_so_far). Start at the source's successors.
        stack: list[tuple[str, list[str]]] = [
            (s, [source_id, s]) for s in self.wf.successors(source_id)
        ]
        seen: set[str] = set()
        while stack:
            nid, path = stack.pop()
            if nid in seen:
                continue
            seen.add(nid)
            if is_guard(nid):
                continue  # protected from here on - prune this subtree
            if is_target(nid):
                offending.append(path)
                continue  # reached the danger; no need to look deeper on this branch
            for succ in self.wf.successors(nid):
                stack.append((succ, path + [succ]))
        return offending

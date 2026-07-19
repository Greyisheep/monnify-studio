"""IR graph-edit primitives for Apply-Fix (#6).

Small, deep operations that mutate a workflow in place: splice a chain of nodes
onto an edge, or remove a node and bridge its neighbours. `apply_fix` deep-copies
the workflow before calling these, so callers here mutate freely.

These are the mechanism behind D9 - remediation inserts *visible safety nodes*,
so the fix shows up on the canvas as boxes, not as hidden edge metadata.

Traceability: #6 (P1.4 - Remediation); decision D9.
"""

from __future__ import annotations

from ..ir.models import Edge, Node, Position, Workflow


def unique_id(wf: Workflow, base: str) -> str:
    """A node id derived from `base` that isn't already taken."""
    if not wf.has_node(base):
        return base
    i = 2
    while wf.has_node(f"{base}_{i}"):
        i += 1
    return f"{base}_{i}"


def _lerp(a: Position, b: Position, t: float) -> Position:
    return Position(x=a.x + (b.x - a.x) * t, y=a.y + (b.y - a.y) * t)


def insert_chain_on_edge(
    wf: Workflow, src: str, dst: str, specs: list[tuple[str, str]]
) -> list[str]:
    """Replace edge `src → dst` with `src → n1 → … → nk → dst`.

    `specs` is a list of (node_type, label). Returns the new node ids. The
    original edge's kind (e.g. an async `event` transition) is preserved on the
    first hop so the state-machine semantics survive the rewrite.
    """
    edge = next((e for e in wf.edges if e.source == src and e.target == dst), None)
    if edge is None:
        raise ValueError(f"no edge {src} -> {dst} to splice")
    first_kind = edge.kind
    wf.edges.remove(edge)

    src_pos, dst_pos = wf.node(src).position, wf.node(dst).position
    prev = src
    new_ids: list[str] = []
    n = len(specs)
    for i, (ntype, label) in enumerate(specs, start=1):
        nid = unique_id(wf, f"{dst}_{ntype.split('.')[-1]}")
        wf.nodes.append(
            Node(id=nid, type=ntype, label=label, position=_lerp(src_pos, dst_pos, i / (n + 1)))
        )
        wf.edges.append(Edge(source=prev, target=nid, kind=first_kind if prev == src else "control"))
        prev = nid
        new_ids.append(nid)
    wf.edges.append(Edge(source=prev, target=dst, kind="control"))
    return new_ids


def remove_node_reconnect(wf: Workflow, node_id: str) -> None:
    """Delete a node and bridge each predecessor to each successor, so the graph
    stays connected around the hole."""
    preds = wf.predecessors(node_id)
    succs = wf.successors(node_id)
    wf.nodes = [nd for nd in wf.nodes if nd.id != node_id]
    wf.edges = [e for e in wf.edges if e.source != node_id and e.target != node_id]
    for p in preds:
        for s in succs:
            if not any(e.source == p and e.target == s for e in wf.edges):
                wf.edges.append(Edge(source=p, target=s, kind="control"))

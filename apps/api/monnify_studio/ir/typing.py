"""Domain-type compatibility for typed canvas wiring (P1.2).

A connection A.port → B.port is valid when the producer's DomainType is
compatible with the consumer's. ANY is a wildcard on either side.
"""

from __future__ import annotations

from ..ir.types import DomainType
from ..providers.base import Catalog


def types_compatible(producer: DomainType, consumer: DomainType) -> bool:
    if producer == DomainType.ANY or consumer == DomainType.ANY:
        return True
    return producer == consumer


def validate_port_connection(
    catalog: Catalog,
    source_type: str,
    source_port: str,
    target_type: str,
    target_port: str,
) -> tuple[bool, str]:
    """Return (ok, message). Message is empty on success; TYPE ERROR text otherwise."""
    src = catalog.get(source_type)
    tgt = catalog.get(target_type)
    if src is None:
        return False, f"TYPE ERROR: unknown source node type `{source_type}`"
    if tgt is None:
        return False, f"TYPE ERROR: unknown target node type `{target_type}`"

    out = src.output(source_port)
    inp = tgt.input(target_port)
    if out is None:
        return False, f"TYPE ERROR: `{source_type}` has no output port `{source_port}`"
    if inp is None:
        return False, f"TYPE ERROR: `{target_type}` has no input port `{target_port}`"

    if not types_compatible(out.type, inp.type):
        return (
            False,
            f"TYPE ERROR: {out.type.value} → {inp.type.value} "
            f"(`{source_type}.{source_port}` cannot wire to `{target_type}.{target_port}`)",
        )
    return True, ""


def control_edge_type_hint(
    catalog: Catalog,
    source_type: str,
    target_type: str,
) -> tuple[bool, str]:
    """Soft check when drawing a control/event edge between two node types.

    Allows the edge when either side has no ports, or when at least one
    source output is compatible with a target input. Rejects when both sides
    declare ports and none are compatible (e.g. BankList → PaymentReference).
    """
    src = catalog.get(source_type)
    tgt = catalog.get(target_type)
    if src is None or tgt is None:
        return True, ""  # unknown types: don't block control-flow editing

    if not src.outputs or not tgt.inputs:
        return True, ""

    for out in src.outputs:
        for inp in tgt.inputs:
            if types_compatible(out.type, inp.type):
                return True, ""

    src_types = ", ".join(sorted({o.type.value for o in src.outputs}))
    tgt_types = ", ".join(sorted({i.type.value for i in tgt.inputs}))
    return (
        False,
        f"TYPE ERROR: no compatible ports ({src_types} → {tgt_types})",
    )

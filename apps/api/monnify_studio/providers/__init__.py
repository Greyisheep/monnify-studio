from .base import Catalog, NodeTypeDef, PortSpec
from .core import CORE_NODE_TYPES
from .monnify import MONNIFY_NODE_TYPES


def default_catalog() -> Catalog:
    """Core (provider-neutral) types + the Monnify pack.

    To support another provider later, register its pack here - the engine,
    analyzer and IR need no changes (D13).
    """
    return Catalog(CORE_NODE_TYPES).register_pack(MONNIFY_NODE_TYPES)


__all__ = [
    "CORE_NODE_TYPES",
    "MONNIFY_NODE_TYPES",
    "Catalog",
    "NodeTypeDef",
    "PortSpec",
    "default_catalog",
]

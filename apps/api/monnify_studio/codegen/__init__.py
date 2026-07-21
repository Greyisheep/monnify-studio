"""Deterministic code generation from flows (#146). No LLM in this path (D3)."""

from .python import generate_python

__all__ = ["generate_python"]

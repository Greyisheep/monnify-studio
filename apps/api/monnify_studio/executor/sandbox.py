"""Run a Code Block's snippet for real, without handing it the keys (#147, #69).

Running arbitrary user code near live Monnify credentials is the reckless thing
the honest-scaffolding v1 refused to do. This module makes it safe with two
independent boundaries, either of which alone stops the obvious attacks:

  1. AST allowlist (primary): the snippet is parsed and rejected before it ever
     runs if it imports anything, touches a dunder attribute (the usual
     ``().__class__.__bases__`` escape), or names a dangerous builtin. With no
     imports and no ``open``/``eval``/``getattr``, it cannot reach os, sockets,
     or the filesystem - it can only compute.
  2. Subprocess jail (defense in depth): even a validated snippet runs in a
     fresh ``python -I -S`` process with a CLEARED environment (so none of our
     secrets are visible), CPU/address-space/file-size/fd rlimits, and a
     wall-clock timeout the parent enforces by killing the process group.

Contract (matches codegen, python.py): the snippet sees a mutable dict ``ctx``
(the merged upstream outputs) and ``Decimal``; whatever it leaves in ``ctx`` is
the node's output and flows downstream. A failure is surfaced honestly, never
swallowed into a fake success.
"""

from __future__ import annotations

import ast
import json
import subprocess
import sys
from typing import Any

# Builtins the snippet may use. Anything that can open a file, import, or reach
# an object's internals is deliberately absent.
_ALLOWED_BUILTINS = frozenset(
    {
        "abs", "all", "any", "bool", "dict", "divmod", "enumerate", "filter",
        "float", "frozenset", "int", "len", "list", "map", "max", "min", "pow",
        "range", "repr", "reversed", "round", "set", "sorted", "str", "sum",
        "tuple", "zip", "True", "False", "None",
    }
)

# Names a snippet may never reference, even though they are not exposed as
# builtins (belt and suspenders against a clever escape).
_DENIED_NAMES = frozenset(
    {
        "eval", "exec", "compile", "open", "__import__", "globals", "locals",
        "getattr", "setattr", "delattr", "vars", "input", "breakpoint", "exit",
        "quit", "help", "object", "type", "super", "memoryview", "classmethod",
        "staticmethod", "property", "__builtins__",
    }
)

_TIMEOUT_S = 2.0
_MEM_BYTES = 512 * 1024 * 1024


class SandboxError(RuntimeError):
    """The snippet was rejected before running or failed/aborted while running."""


def _validate(source: str) -> None:
    """Reject anything that could escape pure computation, with a clear reason."""
    try:
        tree = ast.parse(source, mode="exec")
    except SyntaxError as exc:
        raise SandboxError(f"SyntaxError: {exc.msg} (line {exc.lineno})") from None
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            raise SandboxError("imports are not allowed in a code block")
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            raise SandboxError(f"dunder attribute access is not allowed: {node.attr}")
        if isinstance(node, ast.Name) and node.id in _DENIED_NAMES:
            raise SandboxError(f"name is not allowed in a code block: {node.id}")
        if isinstance(node, (ast.Global, ast.Nonlocal)):
            raise SandboxError("global/nonlocal are not allowed in a code block")


# The child process: rebuild a restricted namespace and run the snippet. Kept as
# a source string so it runs under `python -I -S` with nothing inherited.
_RUNNER = f"""
import sys, json, builtins
from decimal import Decimal
_ALLOWED = {sorted(_ALLOWED_BUILTINS)!r}
payload = json.loads(sys.stdin.read())
safe = {{n: getattr(builtins, n) for n in _ALLOWED if hasattr(builtins, n)}}
ctx = dict(payload["ctx"])
g = {{"__builtins__": safe, "ctx": ctx, "Decimal": Decimal}}
try:
    exec(compile(payload["source"], "<code-block>", "exec"), g)
    out = g.get("ctx", ctx)
    if not isinstance(out, dict):
        out = {{"result": out}}
    sys.stdout.write(json.dumps({{"ok": True, "ctx": out}}, default=str))
except Exception as exc:
    sys.stdout.write(json.dumps({{"ok": False, "error": f"{{type(exc).__name__}}: {{exc}}"}}))
"""


def _limits() -> None:  # pragma: no cover - runs only in the child, pre-exec
    import resource

    # Best-effort per limit: some platforms (macOS) refuse RLIMIT_AS. The
    # wall-clock timeout the parent enforces is the universal backstop; on Linux
    # (Cloud Run, our prod target) every limit below applies.
    for res, soft_hard in (
        (resource.RLIMIT_CPU, (1, 1)),
        (resource.RLIMIT_AS, (_MEM_BYTES, _MEM_BYTES)),
        (resource.RLIMIT_FSIZE, (0, 0)),  # cannot write files
        (resource.RLIMIT_NOFILE, (16, 16)),
    ):
        try:
            resource.setrlimit(res, soft_hard)
        except (ValueError, OSError):
            pass


def run_user_code(source: str, ctx: dict[str, Any], *, timeout: float = _TIMEOUT_S) -> dict[str, Any]:
    """Run `source` over `ctx` in the jail and return the mutated ctx.

    Raises SandboxError on rejection, provider-side error, timeout, or crash.
    """
    _validate(source)
    payload = json.dumps({"source": source, "ctx": ctx}, default=str)
    try:
        proc = subprocess.run(
            [sys.executable, "-I", "-S", "-c", _RUNNER],
            input=payload,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={},  # no secrets reach the snippet
            preexec_fn=_limits,
        )
    except subprocess.TimeoutExpired:
        raise SandboxError(f"code block timed out after {timeout:g}s") from None
    if proc.returncode != 0 or not proc.stdout:
        detail = (proc.stderr or "").strip().splitlines()[-1:] or ["killed (resource limit?)"]
        raise SandboxError(f"code block aborted: {detail[0]}")
    result = json.loads(proc.stdout)
    if not result.get("ok"):
        raise SandboxError(result.get("error", "code block failed"))
    return result["ctx"]

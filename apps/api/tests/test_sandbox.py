"""Code Block execution is real but jailed (#147, #69).

A snippet can compute over the flow's context, but it must never be able to
import, open a file, reach an object's internals, or outrun a timeout - because
it runs on the same box as our live Monnify credentials.
"""

from __future__ import annotations

import pytest

from monnify_studio.executor import MockAdapter, run_workflow
from monnify_studio.executor.sandbox import SandboxError, run_user_code
from monnify_studio.ir.models import Edge, Node, Workflow


def test_safe_snippet_transforms_ctx() -> None:
    out = run_user_code(
        "ctx['fee'] = str(Decimal(ctx['amount']) * Decimal('0.02'))",
        {"amount": "5000"},
    )
    assert out["fee"] == "100.00"
    assert out["amount"] == "5000"  # untouched inputs still flow


@pytest.mark.parametrize(
    "snippet",
    [
        "import os\nctx['x'] = os.getcwd()",
        "ctx['x'] = open('/etc/passwd').read()",
        "ctx['x'] = __import__('os').listdir('.')",
        "ctx['x'] = eval('1+1')",
        "ctx['x'] = ().__class__.__bases__",
        "ctx['x'] = (1).__class__.__mro__",
    ],
)
def test_escape_attempts_are_rejected(snippet: str) -> None:
    with pytest.raises(SandboxError):
        run_user_code(snippet, {"amount": "5000"})


def test_infinite_loop_is_killed() -> None:
    with pytest.raises(SandboxError):
        run_user_code("while True:\n    pass", {}, timeout=1.5)


def test_syntax_error_is_a_clean_sandbox_error() -> None:
    with pytest.raises(SandboxError):
        run_user_code("ctx[ = ", {})


def _code_workflow(snippet: str) -> Workflow:
    return Workflow(
        id="cb", name="code-block", entrypoint="seed",
        nodes=[
            Node(id="seed", type="monnify.initialize_transaction", config={"amount": "5000"}),
            Node(id="calc", type="custom.code", config={"code": snippet}),
        ],
        edges=[Edge(source="seed", target="calc")],
    )


def test_code_block_runs_in_a_full_flow() -> None:
    """The snippet reads what flowed in and its result flows on (MockAdapter)."""
    run = run_workflow(
        _code_workflow("ctx['platform_fee'] = str(Decimal(ctx['amount']) * Decimal('0.015'))"),
        adapter=MockAdapter(),
    )
    from monnify_studio.executor import execution_store

    calc = [e for e in execution_store.list_events(run.id) if e.node_id == "calc" and e.outputs]
    assert calc, "calc node produced no outputs"
    from decimal import Decimal

    assert Decimal(calc[-1].outputs["platform_fee"]) == Decimal("75")


def test_malicious_code_block_fails_the_node() -> None:
    run = run_workflow(_code_workflow("import socket"), adapter=MockAdapter())
    from monnify_studio.executor import RunStatus

    assert run.status is RunStatus.FAILED

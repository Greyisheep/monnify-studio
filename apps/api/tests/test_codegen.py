"""Flow -> Python codegen: deterministic, compilable, grounded (#146)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from monnify_studio.api.main import app
from monnify_studio.codegen import generate_python
from monnify_studio.ir.models import Edge, Node, Workflow
from monnify_studio.templates import build_template

client = TestClient(app)


def test_every_template_generates_compilable_python():
    for template_id in ("sell-online", "invoice", "ajo", "payroll"):
        src = generate_python(build_template(template_id))
        compile(src, f"<{template_id}>", "exec")  # SyntaxError = fail


def test_codegen_is_deterministic():
    a = generate_python(build_template("sell-online"))
    b = generate_python(build_template("sell-online"))
    assert a == b


def test_generated_code_is_grounded_and_real():
    src = generate_python(build_template("sell-online"))
    # Real documented endpoint, not a placeholder.
    assert "/api/v1/merchant/transactions/init-transaction" in src
    # Catalog grounding travels into docstrings: doc links + cheat-sheet notes.
    assert "developers.monnify.com" in src
    # Safety blocks become guards that raise, never silent passes.
    assert "class GuardFailed" in src and "raise GuardFailed" in src
    # Money compared exactly, never floats (D21 carried into generated code).
    assert "Decimal" in src


def test_node_config_lands_in_generated_body():
    wf = Workflow(
        id="cfg",
        name="Config Flow",
        nodes=[
            Node(id="init", type="monnify.initialize_transaction", label="Start",
                 config={"amount": "45000"}),
        ],
        edges=[],
        entrypoint="init",
    )
    src = generate_python(wf)
    compile(src, "<cfg>", "exec")
    assert '"amount": \'45000\'' in src or "\"amount\": '45000'" in src


def test_custom_code_block_lands_verbatim():
    wf = Workflow(
        id="code",
        name="Code Flow",
        nodes=[
            Node(id="fee", type="custom.code", label="Fee Logic",
                 config={"code": "platform_fee = Decimal('0.01')\nctx['fee'] = platform_fee"}),
            Node(id="pay", type="monnify.initiate_transfer", label="Pay"),
        ],
        edges=[Edge(source="fee", target="pay")],
        entrypoint="fee",
    )
    src = generate_python(wf)
    compile(src, "<code>", "exec")
    assert "platform_fee = Decimal('0.01')" in src
    assert "your code block (verbatim" in src


def test_code_endpoint_serves_the_module():
    wf = client.post("/workflows/from-template/invoice").json()["workflow"]
    res = client.get(f"/workflows/{wf['id']}/code")
    assert res.status_code == 200
    body = res.json()
    assert body["language"] == "python"
    assert body["filename"].endswith(".py")
    compile(body["code"], "<served>", "exec")


def test_code_endpoint_404_and_bad_lang():
    assert client.get("/workflows/nope/code").status_code == 404
    wf = client.post("/workflows/from-template/invoice").json()["workflow"]
    assert client.get(f"/workflows/{wf['id']}/code?lang=cobol").status_code == 400

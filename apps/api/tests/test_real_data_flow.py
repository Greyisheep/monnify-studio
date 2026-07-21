"""Real data flow through runs: values travel, config drives requests (#145)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from monnify_studio.api.main import app
from monnify_studio.executor import MockAdapter, execution_store, run_workflow
from monnify_studio.ir.models import Edge, Node, Workflow
from monnify_studio.templates import build_template

client = TestClient(app)


def _chain(amount: str) -> Workflow:
    """init(amount from config) -> webhook -> verify -> validate."""
    return Workflow(
        id="flow-test",
        name="Data Flow Test",
        nodes=[
            Node(id="init", type="monnify.initialize_transaction", label="Start",
                 config={"amount": amount}),
            Node(id="hook", type="event.payment_webhook", label="Paid?"),
            Node(id="verify", type="monnify.verify_transaction", label="Verify"),
            Node(id="check", type="safety.validate_amount", label="Check"),
        ],
        edges=[
            Edge(source="init", target="hook"),
            Edge(source="hook", target="verify", kind="event"),
            Edge(source="verify", target="check"),
        ],
        entrypoint="init",
    )


def _outputs_by_node(run_id: str) -> dict[str, dict]:
    events = execution_store.list_events(run_id)
    return {
        e.node_id: e.outputs
        for e in events
        if e.type.value == "node.completed" and e.node_id
    }


def test_config_amount_flows_all_the_way_downstream():
    run = run_workflow(_chain("45000"), adapter=MockAdapter())
    outs = _outputs_by_node(run.id)
    # The amount a dev typed on the FIRST node is what every later node acts on.
    assert outs["verify"]["paid_amount"] == "45000.00"
    assert outs["check"]["expected_amount"] == "45000.00"
    assert outs["check"]["valid"] is True


def test_editing_the_config_changes_downstream_outputs():
    a = _outputs_by_node(run_workflow(_chain("45000"), adapter=MockAdapter()).id)
    b = _outputs_by_node(run_workflow(_chain("99000"), adapter=MockAdapter()).id)
    assert a["verify"]["paid_amount"] != b["verify"]["paid_amount"]
    assert b["check"]["paid_amount"] == "99000.00"


def test_events_carry_the_inputs_each_node_saw():
    run = run_workflow(_chain("45000"), adapter=MockAdapter())
    events = execution_store.list_events(run.id)
    verify_done = next(
        e for e in events if e.type.value == "node.completed" and e.node_id == "verify"
    )
    # verify's inputs are the webhook's outputs: the paid amount that arrived.
    assert verify_done.inputs is not None
    assert verify_done.inputs.get("paid_amount") == "45000.00"


def test_config_lands_in_the_request_body():
    run = run_workflow(_chain("45000"), adapter=MockAdapter())
    events = execution_store.list_events(run.id)
    init_done = next(
        e for e in events if e.type.value == "node.completed" and e.node_id == "init"
    )
    assert init_done.request is not None
    assert init_done.request["body"]["config"] == {"amount": "45000"}


def test_custom_code_declared_outputs_flow_downstream():
    """Honest v1 of code blocks (#147): declared outputs feed the next node."""
    wf = Workflow(
        id="code-test",
        name="Code Block Test",
        nodes=[
            Node(id="code", type="custom.code", label="My Fee Logic",
                 config={"code": "def fee(x): return x * 0.01",
                         "outputs": {"amount": "500"}}),
            Node(id="pay", type="monnify.initiate_transfer", label="Pay Fee"),
        ],
        edges=[Edge(source="code", target="pay")],
        entrypoint="code",
    )
    outs = _outputs_by_node(run_workflow(wf, adapter=MockAdapter()).id)
    # Downstream nodes normalize flowing money to kobo-exact strings (D21).
    assert outs["pay"]["amount"] == "500.00"


def test_templates_still_run_clean_with_derived_outputs():
    for template_id in ("sell-online", "invoice", "ajo", "payroll"):
        run = run_workflow(build_template(template_id), adapter=MockAdapter())
        assert run.status.value == "completed", template_id

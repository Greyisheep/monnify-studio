"""The Employee List sheet must actually drive a payroll Run (#payroll).

A dev types employees into app.data_rows; those rows have to flow to the bulk
transfer so a Run pays the people they entered, and to a notify block so each
one is messaged.
"""

from __future__ import annotations

from monnify_studio.executor.adapter import MockAdapter
from monnify_studio.ir.models import Node

ROWS = [
    {"name": "Ada Obi", "phone": "08030000001", "account_number": "0123456789", "bank_code": "058", "amount": "150000"},
    {"name": "Bola Ade", "phone": "08030000002", "account_number": "0123456790", "bank_code": "058", "amount": "90000"},
]


def test_data_rows_outputs_the_typed_employees() -> None:
    res = MockAdapter().invoke(
        Node(id="rows", type="app.data_rows", config={"rows": ROWS}), {"inputs": {}}
    )
    assert res.outputs["row_count"] == 2
    assert res.outputs["total"] == "240000.00"
    assert res.outputs["rows"][0]["name"] == "Ada Obi"


def test_bulk_transfer_pays_each_employee_from_the_sheet() -> None:
    res = MockAdapter().invoke(
        Node(id="bulk", type="monnify.bulk_transfer"), {"inputs": {"rows": ROWS}}
    )
    assert res.outputs["paid_count"] == 2
    assert res.outputs["total_paid"] == "240000.00"
    names = [r["name"] for r in res.outputs["results"]]
    assert names == ["Ada Obi", "Bola Ade"]


def test_notify_targets_each_employee_with_contact() -> None:
    res = MockAdapter().invoke(
        Node(id="n", type="app.notify_whatsapp"), {"inputs": {"rows": ROWS}}
    )
    assert res.outputs["recipients"] == 2


def test_empty_sheet_is_a_clean_no_op() -> None:
    res = MockAdapter().invoke(Node(id="rows", type="app.data_rows"), {"inputs": {}})
    assert res.outputs["row_count"] == 0
    assert res.outputs["total"] == "0.00"


def test_payroll_summary_message_is_specific() -> None:
    from monnify_studio.executor.adapter import _employee_message, _notify_message

    msg = _notify_message({}, "0", roster=ROWS)
    assert "2 people paid" in msg and "NGN 240,000" in msg
    assert "-" not in msg.replace("Sent from", "")  # no em/en dashes

    emp = _employee_message("Ada Obi", "150000")
    assert "Ada Obi" in emp and "NGN 150,000" in emp


def test_payment_confirmation_message_when_no_roster() -> None:
    from monnify_studio.executor.adapter import _notify_message

    msg = _notify_message({}, "5000")
    assert "Payment confirmed" in msg and "NGN 5,000" in msg


def test_node_message_override_wins() -> None:
    from monnify_studio.executor.adapter import _notify_message

    assert _notify_message({"message": "Custom hi"}, "5000", roster=ROWS) == "Custom hi"

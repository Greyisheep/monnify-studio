"""Intent fidelity: a safe flow must also be the flow the user asked for (#113)."""

from __future__ import annotations

import monnify_studio.ai.composer as comp
from monnify_studio.ai.composer import compose_flow
from monnify_studio.ai.fidelity import intent_gaps
from monnify_studio.ai.schema import MoniFlow, MoniFlowEdge, MoniFlowNode

# A clean accept-only flow: collects and fulfils, but tells nobody and pays nobody.
_ACCEPT_ONLY = MoniFlow(
    name="Collect",
    nodes=[
        MoniFlowNode(id="init", type="monnify.initialize_transaction"),
        MoniFlowNode(id="webhook", type="event.payment_webhook"),
        MoniFlowNode(id="vsig", type="safety.verify_signature"),
        MoniFlowNode(id="verify", type="monnify.verify_transaction"),
        MoniFlowNode(id="vamt", type="safety.validate_amount"),
        MoniFlowNode(id="idem", type="safety.idempotency_guard"),
        MoniFlowNode(id="paid", type="app.mark_order_paid"),
    ],
    edges=[
        MoniFlowEdge(source="init", target="webhook"),
        MoniFlowEdge(source="webhook", target="vsig", kind="event"),
        MoniFlowEdge(source="vsig", target="verify"),
        MoniFlowEdge(source="verify", target="vamt"),
        MoniFlowEdge(source="vamt", target="idem"),
        MoniFlowEdge(source="idem", target="paid"),
    ],
)

# The same flow with a receipt at the end.
_WITH_NOTIFY = _ACCEPT_ONLY.model_copy(deep=True)
_WITH_NOTIFY.nodes.append(MoniFlowNode(id="receipt", type="app.notify"))
_WITH_NOTIFY.edges.append(MoniFlowEdge(source="paid", target="receipt"))


class _Seq:
    """Fake provider returning a scripted sequence (last one repeats)."""

    name = "fake"

    def __init__(self, flows):
        self._flows = list(flows)
        self.calls = 0

    def available(self):
        return True

    def structured(self, **_):
        self.calls += 1
        return self._flows.pop(0) if len(self._flows) > 1 else self._flows[0]


def _wf(flow: MoniFlow):
    from monnify_studio.providers import default_catalog

    return comp._to_workflow(flow, default_catalog())


# --- the deterministic check itself -------------------------------------------


def test_gap_detected_when_receipt_requested_but_absent():
    gaps = intent_gaps("sell my cakes and send buyers a receipt", _wf(_ACCEPT_ONLY))
    assert len(gaps) == 1 and "notif" in gaps[0]


def test_no_gap_when_flow_covers_the_ask():
    assert intent_gaps("sell my cakes and send buyers a receipt", _wf(_WITH_NOTIFY)) == []


def test_pay_me_is_accept_not_payout():
    # "pay me" must NOT read as a payout request (that is the accept side).
    gaps = intent_gaps("customers pay me for logo design", _wf(_ACCEPT_ONLY))
    assert gaps == []


def test_payroll_words_require_a_payout():
    gaps = intent_gaps("pay my staff their salaries every month", _wf(_ACCEPT_ONLY))
    assert any("payout" in g for g in gaps)


# --- the loop behavior ---------------------------------------------------------


def test_fidelity_round_fixes_the_gap(monkeypatch):
    fake = _Seq([_ACCEPT_ONLY, _WITH_NOTIFY])
    monkeypatch.setattr(comp, "select_provider", lambda p=None: fake)
    out = compose_flow("sell my cakes and send buyers a receipt")
    assert fake.calls == 2  # one fidelity round, then done
    assert any(n.type == "app.notify" for n in out.workflow.nodes)


def test_fidelity_never_loses_the_clean_flow(monkeypatch):
    # Retry keeps missing the receipt: return the original clean flow, no error.
    fake = _Seq([_ACCEPT_ONLY])
    monkeypatch.setattr(comp, "select_provider", lambda p=None: fake)
    out = compose_flow("sell my cakes and send buyers a receipt")
    assert out.report_after.findings == []
    assert len(out.workflow.nodes) == 7  # the safe original came back


def test_no_fidelity_round_when_nothing_is_missing(monkeypatch):
    fake = _Seq([_WITH_NOTIFY])
    monkeypatch.setattr(comp, "select_provider", lambda p=None: fake)
    compose_flow("sell my cakes and send buyers a receipt")
    assert fake.calls == 1  # no phantom complaint, no wasted round

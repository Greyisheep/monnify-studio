"""Every trace event speaks plain words; no internal refs leak (#79)."""

from __future__ import annotations

from monnify_studio.executor import MockAdapter, run_workflow, execution_store
from monnify_studio.templates import build_template


def _events():
    run = run_workflow(build_template("sell-online"), adapter=MockAdapter())
    return execution_store.list_events(run.id)


def test_every_event_has_friendly_text():
    events = _events()
    assert events
    for ev in events:
        assert ev.friendly_text, f"{ev.type} missing friendly_text"


def test_no_internal_refs_in_any_user_facing_string():
    for ev in _events():
        blob = f"{ev.message} {ev.friendly_text}"
        for leak in ("(D1)", "(D2)", "#5", "IR "):
            assert leak not in blob, f"internal ref leaked: {leak!r} in {blob!r}"


def test_waiting_reads_like_waiting():
    waiting = [e for e in _events() if e.type.value == "node.waiting"]
    assert waiting and all(e.friendly_text.startswith("Waiting:") for e in waiting)
    assert all("D1" not in e.message for e in waiting)

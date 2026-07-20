#!/usr/bin/env python
"""Moni reliability eval: can she engineer non-templated business ideas? (#106)

Runs a battery of plain-language needs across the money pillars through the real
compose loop and reports, for each: did it BUILD an analyzer-clean flow, REFUSE
honestly, or hit an outage; how many nodes; which findings the analyzer caught
and Apply-Fix cleared; and which pillars + primitives the flow actually covers
(accept / payout / wallet-ledger / notify). This is measurement, not assertion:
"a 200 doesn't mean it's correct", so we check what Moni ships, not that she ships.

Needs a real provider key (CLAUDE_API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY).
Run from apps/api:  uv run python scripts/moni_eval.py
"""

from __future__ import annotations

import sys

from monnify_studio.ai.composer import (
    ComposeError,
    ComposeRefused,
    ComposeUnavailable,
    compose_flow,
)
from monnify_studio.artifacts import flow_features

# Non-templated needs spanning the pillars from the product model (#105). None of
# these is a canned template; Moni must engineer each from the catalog.
BATTERY: list[tuple[str, str]] = [
    ("invoice", "A freelance brand designer who bills clients for logos and websites and wants to get paid online"),
    ("dedicated-account", "Collect monthly rent from my ten tenants, each paying into their own dedicated account"),
    ("ajo-ledger", "A cooperative where twelve people contribute weekly; track each member's balance and pay the pot to one member on rotation"),
    ("bulk-payout", "Pay twenty delivery riders their earnings every Friday, and make sure no money goes to a wrong account"),
    ("wallet-fee", "A savings wallet where users top up and withdraw, and I take a one percent platform fee on each top up"),
    ("notify", "When a customer pays for my catering, send them a WhatsApp receipt and email me a heads up"),
    ("balance-gated-loan", "A thrift group that only lets a member take a loan if their savings balance covers it, then records the debit"),
    ("cross-pillar", "An event ticketing page: sell tickets, pay the venue their cut after the event, and text buyers their ticket"),
    ("infeasible", "Build me a rocket to the moon"),
]


def _pillars(workflow) -> str:
    f = flow_features(workflow)
    tags = []
    if f.collects or f.has_invoices:
        tags.append("accept")
    if f.has_payout:
        tags.append("payout")
    if f.has_ledger:
        tags.append("ledger")
    if f.has_notify:
        tags.append("notify")
    return "+".join(tags) or "-"


def main() -> int:
    print(f"{'case':<20} {'outcome':<9} {'nodes':>5} {'caught->fixed':<16} pillars")
    print("-" * 78)
    builds = refusals = errors = 0
    for name, prompt in BATTERY:
        try:
            out = compose_flow(prompt)
            caught = sorted({f.rule_id for f in out.report_before.findings})
            clean = not out.report_after.findings
            builds += clean
            errors += not clean  # should never happen: the loop refuses if unclean
            caught_s = (",".join(caught) or "none") + ("->clean" if clean else "->DIRTY!")
            print(f"{name:<20} {'BUILT':<9} {len(out.workflow.nodes):>5} "
                  f"{caught_s:<16} {_pillars(out.workflow)}")
        except ComposeRefused as exc:
            refusals += 1
            print(f"{name:<20} {'REFUSED':<9} {'-':>5} {'-':<16} {str(exc)[:34]}")
        except ComposeError as exc:
            errors += 1
            print(f"{name:<20} {'FAILED':<9} {'-':>5} {'-':<16} {str(exc)[:34]}")
        except ComposeUnavailable as exc:
            print(f"{name:<20} {'NO-PROV':<9} {'-':>5} {'-':<16} {exc}")
            return 2
    print("-" * 78)
    print(f"built (clean): {builds}   refused: {refusals}   failed: {errors}   of {len(BATTERY)}")
    # The invariant: nothing BUILT may be DIRTY. builds+refusals should cover the
    # feasible cases; the one infeasible case should REFUSE.
    return 0


if __name__ == "__main__":
    sys.exit(main())
